import { Inject, Injectable } from '@nestjs/common';
import {
  DomainError,
  type Gender,
  type Practitioner,
  type PractitionerPhoto,
  type PractitionerProfileInput,
  type PreviousPractitioner,
  type Specialty,
  type UpdatePractitioner,
} from '@vertex-shifa/contracts';
import {
  type Database,
  practitionerPhotos,
  practitionerSpecialties,
  practitioners,
  specialties,
  type Transaction,
  withTenant,
} from '@vertex-shifa/db';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { holds, type StaffActor } from '../../../core/access/actor.js';
import { assertCurrent, nextUpdatedAt } from '../../../core/concurrency/updated-at.js';
import { DATABASE } from '../../../core/database/database.module.js';
import type { PractitionerProfiles } from '../../platform/access/index.js';
import { recordAudit } from '../../platform/audit/index.js';
import { encodePhoto } from './photo-image.js';

type PractitionerRow = typeof practitioners.$inferSelect;

const iso = (date: Date) => date.toISOString();

const notFound = (what: string) => new DomainError('NOT_FOUND', `${what} not found`);

function profileColumns(profile: PractitionerProfileInput) {
  return {
    displayNameAr: profile.displayNameAr,
    displayNameLatin: profile.displayNameLatin,
    gender: profile.gender,
    syndicateNumber: profile.syndicateNumber,
  };
}

/**
 * Doctor profiles (spec S02 rules 9, 34, 35): the profile of each member with the doctor role,
 * its specialties and photo. The doctor edits their own (`practitioner.edit_own`), the owner every
 * one (`staff.manage`). Staff management creates, restores and archives profiles with the doctor
 * role through the `PRACTITIONER_PROFILES` port. Writes run in the tenant's transaction with their
 * audit entry.
 */
@Injectable()
export class PractitionersService implements PractitionerProfiles {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(actor: StaffActor): Promise<Practitioner[]> {
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(practitioners)
        .where(isNull(practitioners.archivedAt))
        .orderBy(asc(practitioners.displayNameAr), asc(practitioners.id));
      return this.toPractitioners(tx, rows);
    });
  }

  get(actor: StaffActor, id: string): Promise<Practitioner> {
    return withTenant(this.db, actor.tenantId, async (tx) =>
      this.one(tx, await this.currentRow(tx, id)),
    );
  }

  /** Rule 34: gender and 1–3 specialties, with the `updatedAt` the client read. */
  update(actor: StaffActor, id: string, input: UpdatePractitioner): Promise<Practitioner> {
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const row = await this.editableRow(tx, actor, id);
      assertCurrent(row, input.expectedUpdatedAt);
      const now = new Date();
      await this.assertSpecialties(tx, input.specialtyIds);
      const [updated] = await tx
        .update(practitioners)
        .set({ ...profileColumns(input), updatedAt: nextUpdatedAt(row, now) })
        .where(eq(practitioners.id, row.id))
        .returning();
      await this.setSpecialties(tx, row, input.specialtyIds, now);
      await this.audit(tx, actor, 'practitioner.updated', row.id);
      return this.one(tx, updated as PractitionerRow);
    });
  }

  /** Rule 35: re-encoded before the transaction, so no lock is held while the image is processed. */
  async replacePhoto(actor: StaffActor, id: string, upload: Buffer): Promise<PractitionerPhoto> {
    const photo = await encodePhoto(upload);
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const row = await this.editableRow(tx, actor, id);
      await tx
        .update(practitionerPhotos)
        .set({ archivedAt: new Date() })
        .where(
          and(eq(practitionerPhotos.practitionerId, row.id), isNull(practitionerPhotos.archivedAt)),
        );
      const [inserted] = await tx
        .insert(practitionerPhotos)
        .values({
          tenantId: row.tenantId,
          practitionerId: row.id,
          contentType: 'image/jpeg',
          ...photo,
        })
        .returning({ id: practitionerPhotos.id });
      await recordAudit(tx, actor.tenantId, {
        actor,
        action: 'practitioner_photo.replaced',
        entityType: 'practitioner_photo',
        entityId: (inserted as { id: string }).id,
      });
      return toPhoto(photo);
    });
  }

  getPhoto(actor: StaffActor, id: string): Promise<PractitionerPhoto> {
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const row = await this.currentRow(tx, id);
      const [photo] = await tx
        .select()
        .from(practitionerPhotos)
        .where(
          and(eq(practitionerPhotos.practitionerId, row.id), isNull(practitionerPhotos.archivedAt)),
        );
      if (!photo) throw notFound('Photo');
      return toPhoto(photo);
    });
  }

  archivePhoto(actor: StaffActor, id: string): Promise<Practitioner> {
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const row = await this.editableRow(tx, actor, id);
      const [photo] = await tx
        .update(practitionerPhotos)
        .set({ archivedAt: new Date() })
        .where(
          and(eq(practitionerPhotos.practitionerId, row.id), isNull(practitionerPhotos.archivedAt)),
        )
        .returning({ id: practitionerPhotos.id });
      if (!photo) throw notFound('Photo');
      await recordAudit(tx, actor.tenantId, {
        actor,
        action: 'practitioner_photo.archived',
        entityType: 'practitioner_photo',
        entityId: photo.id,
      });
      return this.one(tx, row);
    });
  }

  /** The platform's specialties in use, by position (public names, no tenant). */
  async specialties(): Promise<Specialty[]> {
    const rows = await this.db
      .select()
      .from(specialties)
      .where(isNull(specialties.archivedAt))
      .orderBy(asc(specialties.position));
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      nameAr: row.nameAr,
      nameLatin: row.nameLatin,
      position: row.position,
    }));
  }

  // The `PRACTITIONER_PROFILES` port of access (in the staff change's transaction).

  async assign(
    tx: Transaction,
    membershipId: string,
    profile: PractitionerProfileInput | undefined,
    actor: StaffActor,
  ): Promise<void> {
    const [current] = await tx
      .select({ id: practitioners.id })
      .from(practitioners)
      .where(and(eq(practitioners.membershipId, membershipId), isNull(practitioners.archivedAt)));
    if (current) return;
    const now = new Date();
    if (profile) await this.assertSpecialties(tx, profile.specialtyIds);
    const archived = await this.latestArchivedRow(tx, membershipId);
    if (archived) {
      const [restored] = await tx
        .update(practitioners)
        .set({
          ...(profile ? profileColumns(profile) : {}),
          archivedAt: null,
          updatedAt: nextUpdatedAt(archived, now),
        })
        .where(eq(practitioners.id, archived.id))
        .returning();
      if (profile)
        await this.setSpecialties(tx, restored as PractitionerRow, profile.specialtyIds, now);
      await this.audit(tx, actor, 'practitioner.restored', archived.id);
      return;
    }
    if (!profile) throw new DomainError('VALIDATION_FAILED', 'Invalid fields: practitioner');
    const [created] = await tx
      .insert(practitioners)
      .values({ tenantId: actor.tenantId, membershipId, ...profileColumns(profile) })
      .returning();
    await this.setSpecialties(tx, created as PractitionerRow, profile.specialtyIds, now);
    await this.audit(tx, actor, 'practitioner.created', (created as PractitionerRow).id);
  }

  async archive(tx: Transaction, membershipId: string, actor: StaffActor): Promise<void> {
    const now = new Date();
    const [row] = await tx
      .update(practitioners)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(practitioners.membershipId, membershipId), isNull(practitioners.archivedAt)))
      .returning({ id: practitioners.id });
    if (row) await this.audit(tx, actor, 'practitioner.archived', row.id);
  }

  async currentIds(tx: Transaction, membershipIds: string[]): Promise<Map<string, string>> {
    if (membershipIds.length === 0) return new Map();
    const rows = await tx
      .select({ id: practitioners.id, membershipId: practitioners.membershipId })
      .from(practitioners)
      .where(
        and(inArray(practitioners.membershipId, membershipIds), isNull(practitioners.archivedAt)),
      );
    return new Map(rows.map((row) => [row.membershipId, row.id]));
  }

  async current(tx: Transaction, membershipId: string): Promise<Practitioner | null> {
    const [row] = await tx
      .select()
      .from(practitioners)
      .where(and(eq(practitioners.membershipId, membershipId), isNull(practitioners.archivedAt)));
    return row ? this.one(tx, row) : null;
  }

  async previous(tx: Transaction, membershipId: string): Promise<PreviousPractitioner> {
    const [current] = await tx
      .select({ id: practitioners.id })
      .from(practitioners)
      .where(and(eq(practitioners.membershipId, membershipId), isNull(practitioners.archivedAt)));
    const archived = current ? undefined : await this.latestArchivedRow(tx, membershipId);
    if (!archived) return { practitioner: null, photo: null };
    const [photo] = await tx
      .select()
      .from(practitionerPhotos)
      .where(
        and(
          eq(practitionerPhotos.practitionerId, archived.id),
          isNull(practitionerPhotos.archivedAt),
        ),
      );
    return { practitioner: await this.one(tx, archived), photo: photo ? toPhoto(photo) : null };
  }

  // Shared steps.

  /** The member's latest archived profile: the one the doctor role brings back (rule 9). */
  private async latestArchivedRow(tx: Transaction, membershipId: string) {
    const [row] = await tx
      .select()
      .from(practitioners)
      .where(and(eq(practitioners.membershipId, membershipId), isNotNull(practitioners.archivedAt)))
      .orderBy(desc(practitioners.archivedAt), desc(practitioners.id))
      .limit(1);
    return row;
  }

  /** A current profile; another tenant's or an archived one is `NOT_FOUND`. */
  private async currentRow(tx: Transaction, id: string, options: { lock?: boolean } = {}) {
    const query = tx
      .select()
      .from(practitioners)
      .where(and(eq(practitioners.id, id), isNull(practitioners.archivedAt)));
    const [row] = await (options.lock ? query.for('update') : query);
    if (!row) throw notFound('Practitioner');
    return row;
  }

  /** Rule 34: the owner edits every profile, a doctor their own. */
  private async editableRow(tx: Transaction, actor: StaffActor, id: string) {
    const row = await this.currentRow(tx, id, { lock: true });
    const own = row.membershipId === actor.membershipId && holds(actor, 'practitioner.edit_own');
    if (!holds(actor, 'staff.manage') && !own) {
      throw new DomainError('FORBIDDEN', 'Only the doctor or an owner edits this profile');
    }
    return row;
  }

  private async assertSpecialties(tx: Transaction, ids: string[]) {
    const rows = await tx
      .select({ id: specialties.id })
      .from(specialties)
      .where(and(inArray(specialties.id, ids), isNull(specialties.archivedAt)));
    if (rows.length !== ids.length) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid fields: specialtyIds');
    }
  }

  /** Replaces the profile's specialties when their list or order changed. */
  private async setSpecialties(tx: Transaction, row: PractitionerRow, ids: string[], now: Date) {
    const current = (await this.specialtyIds(tx, [row.id])).get(row.id) ?? [];
    if (current.length === ids.length && current.every((id, index) => id === ids[index])) return;
    await tx
      .update(practitionerSpecialties)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(practitionerSpecialties.practitionerId, row.id),
          isNull(practitionerSpecialties.archivedAt),
        ),
      );
    await tx.insert(practitionerSpecialties).values(
      ids.map((specialtyId, index) => ({
        tenantId: row.tenantId,
        practitionerId: row.id,
        specialtyId,
        position: index + 1,
      })),
    );
  }

  private async specialtyIds(tx: Transaction, ids: string[]): Promise<Map<string, string[]>> {
    const byPractitioner = new Map<string, string[]>();
    if (ids.length === 0) return byPractitioner;
    const rows = await tx
      .select()
      .from(practitionerSpecialties)
      .where(
        and(
          inArray(practitionerSpecialties.practitionerId, ids),
          isNull(practitionerSpecialties.archivedAt),
        ),
      )
      .orderBy(asc(practitionerSpecialties.position));
    for (const row of rows) {
      byPractitioner.set(row.practitionerId, [
        ...(byPractitioner.get(row.practitionerId) ?? []),
        row.specialtyId,
      ]);
    }
    return byPractitioner;
  }

  private audit(
    tx: Transaction,
    actor: StaffActor,
    action:
      | 'practitioner.created'
      | 'practitioner.updated'
      | 'practitioner.archived'
      | 'practitioner.restored',
    id: string,
  ) {
    return recordAudit(tx, actor.tenantId, {
      actor,
      action,
      entityType: 'practitioner',
      entityId: id,
    });
  }

  private async one(tx: Transaction, row: PractitionerRow): Promise<Practitioner> {
    const [practitioner] = await this.toPractitioners(tx, [row]);
    return practitioner as Practitioner;
  }

  private async toPractitioners(tx: Transaction, rows: PractitionerRow[]): Promise<Practitioner[]> {
    const ids = rows.map((row) => row.id);
    const specialtiesOf = await this.specialtyIds(tx, ids);
    const withPhoto = new Set(
      ids.length === 0
        ? []
        : (
            await tx
              .select({ practitionerId: practitionerPhotos.practitionerId })
              .from(practitionerPhotos)
              .where(
                and(
                  inArray(practitionerPhotos.practitionerId, ids),
                  isNull(practitionerPhotos.archivedAt),
                ),
              )
          ).map((photo) => photo.practitionerId),
    );
    return rows.map((row) => ({
      id: row.id,
      membershipId: row.membershipId,
      displayNameAr: row.displayNameAr,
      displayNameLatin: row.displayNameLatin,
      gender: row.gender as Gender,
      specialtyIds: specialtiesOf.get(row.id) ?? [],
      syndicateNumber: row.syndicateNumber,
      hasPhoto: withPhoto.has(row.id),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }));
  }
}

function toPhoto(photo: {
  bytes: Buffer;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
}): PractitionerPhoto {
  return {
    contentType: 'image/jpeg',
    data: photo.bytes.toString('base64'),
    byteSize: photo.byteSize,
    width: photo.width,
    height: photo.height,
    sha256: photo.sha256,
  };
}
