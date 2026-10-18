import { Inject, Injectable } from '@nestjs/common';
import {
  type Area,
  assertTenantStatusChange,
  assertTenantWritable,
  type ChangeTenantStatus,
  type Coordinates,
  type CreateFacility,
  type CreateTenant,
  DomainError,
  type Facility,
  type FacilityPage,
  facilitySchema,
  isShownInDirectory,
  type SetTenantDirectoryListing,
  type Tenant,
  type TenantLogo,
  type TenantPage,
  type TenantStatus,
  type UpdateFacility,
  type UpdateTenantProfile,
} from '@vertex-shifa/contracts';
import {
  areas,
  type Database,
  facilities,
  type Transaction,
  tenantLogos,
  tenants,
  withTenant,
} from '@vertex-shifa/db';
import { and, asc, count, desc, eq, isNotNull, isNull, ne, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Actor, PlatformActor, StaffActor, SystemActor } from '../../../core/access/actor.js';
import { DATABASE } from '../../../core/database/database.module.js';
import { RateLimiter } from '../../../core/rate-limit/rate-limiter.js';
import { recordAudit } from '../audit/index.js';
import { encodeLogo } from './logo-image.js';
import type { MapLinkResolver } from './map-link-resolver.js';

/** Injection token of the map link resolver, so tests can route it to a fake server. */
export const MAP_LINK_RESOLVER = Symbol('MapLinkResolver');

type TenantRow = typeof tenants.$inferSelect;
type FacilityRow = typeof facilities.$inferSelect;
type Page = { page: number; pageSize: number };

/** Vertex staff: in the console (from S02) or through the CLI. */
type StaffOfVertex = PlatformActor | SystemActor;

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? iso(date) : null);

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameLatin: row.nameLatin,
    status: row.status as TenantStatus,
    statusReason: row.statusReason as Tenant['statusReason'],
    statusChangedAt: iso(row.statusChangedAt),
    onboardingCompletedAt: isoOrNull(row.onboardingCompletedAt),
    directoryListed: row.directoryListed,
    directoryShown: isShownInDirectory({
      status: row.status as TenantStatus,
      directoryListed: row.directoryListed,
    }),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    archivedAt: isoOrNull(row.archivedAt),
  };
}

function toFacility(row: FacilityRow): Facility {
  return {
    id: row.id,
    type: 'clinic',
    name: row.name,
    areaId: row.areaId,
    addressDetails: row.addressDetails,
    coordinates: { latitudeE7: row.latitudeE7, longitudeE7: row.longitudeE7 },
    contactPhones: row.contactPhones as Facility['contactPhones'],
    defaultCurrency: row.defaultCurrency as Facility['defaultCurrency'],
    workingDays: row.workingDays,
    displayNameFormat: row.displayNameFormat as Facility['displayNameFormat'],
    displayCallSound: row.displayCallSound,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    archivedAt: isoOrNull(row.archivedAt),
  };
}

function facilityColumns(input: CreateFacility | UpdateFacility) {
  return {
    name: input.name,
    areaId: input.areaId,
    addressDetails: input.addressDetails,
    latitudeE7: input.coordinates.latitudeE7,
    longitudeE7: input.coordinates.longitudeE7,
    contactPhones: input.contactPhones,
    defaultCurrency: input.defaultCurrency,
    workingDays: input.workingDays,
    displayNameFormat: input.displayNameFormat,
    displayCallSound: input.displayCallSound,
  };
}

/** Rule 16: an edit carries the `updatedAt` the client read; any other value is a `CONFLICT`. */
function assertCurrent(row: { updatedAt: Date }, expectedUpdatedAt: string) {
  if (row.updatedAt.getTime() !== Date.parse(expectedUpdatedAt)) {
    throw new DomainError('CONFLICT', 'The record changed since it was read');
  }
}

/**
 * The `updatedAt` of a change to a locked row: now, but always at least a millisecond past the
 * previous value, so two changes within one millisecond never look like one (rule 16).
 */
function nextUpdatedAt(row: { updatedAt: Date }): Date {
  return new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
}

const notFound = (what: string) => new DomainError('NOT_FOUND', `${what} not found`);

function toArea(row: typeof areas.$inferSelect): Area {
  return {
    id: row.id,
    parentId: row.parentId,
    level: row.level as Area['level'],
    nameAr: row.nameAr,
    nameLatin: row.nameLatin,
    archivedAt: isoOrNull(row.archivedAt),
  };
}

/**
 * The tenancy module (S01): tenants, their logo, branches and the area list. Clinic methods take
 * the staff actor, whose tenant comes from the session; console and CLI methods take the tenant id
 * Vertex staff chose. Every write runs in the tenant's transaction, locks the tenant row first (so
 * writes of one tenant are serialized, which keeps rules such as the last branch true), and writes
 * its audit entry in the same transaction.
 */
@Injectable()
export class TenancyService {
  /** 20 link resolutions per minute per tenant (S01). */
  private readonly mapLinkLimit = new RateLimiter(20, 60_000);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MAP_LINK_RESOLVER) private readonly mapLinks: MapLinkResolver,
  ) {}

  // Clinic: the session's tenant.

  getTenant(actor: StaffActor): Promise<Tenant> {
    return withTenant(this.db, actor.tenantId, async (tx) =>
      toTenant(await this.tenantRow(tx, actor.tenantId)),
    );
  }

  updateProfile(actor: StaffActor, input: UpdateTenantProfile): Promise<Tenant> {
    return this.writeSetup(actor, async (tx, tenant) => {
      assertCurrent(tenant, input.expectedUpdatedAt);
      const [row] = await tx
        .update(tenants)
        .set({ nameAr: input.nameAr, nameLatin: input.nameLatin, updatedAt: nextUpdatedAt(tenant) })
        .where(eq(tenants.id, tenant.id))
        .returning();
      await recordAudit(tx, tenant.id, {
        actor,
        action: 'tenant.profile_updated',
        entityType: 'tenant',
        entityId: tenant.id,
      });
      return toTenant(row as TenantRow);
    });
  }

  async replaceLogo(actor: StaffActor, upload: Buffer): Promise<TenantLogo> {
    // Decoded before the transaction: no lock is held while the image is processed.
    const logo = await encodeLogo(upload);
    return this.writeSetup(actor, async (tx, tenant) => {
      await tx
        .update(tenantLogos)
        .set({ archivedAt: new Date() })
        .where(isNull(tenantLogos.archivedAt));
      const [row] = await tx
        .insert(tenantLogos)
        .values({ tenantId: tenant.id, contentType: 'image/png', ...logo })
        .returning({ id: tenantLogos.id });
      await recordAudit(tx, tenant.id, {
        actor,
        action: 'tenant_logo.replaced',
        entityType: 'tenant_logo',
        entityId: (row as { id: string }).id,
      });
      return { contentType: 'image/png', data: logo.bytes.toString('base64'), ...logoFields(logo) };
    });
  }

  getLogo(actor: StaffActor): Promise<TenantLogo> {
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const [row] = await tx.select().from(tenantLogos).where(isNull(tenantLogos.archivedAt));
      if (!row) throw notFound('Logo');
      return { contentType: 'image/png', data: row.bytes.toString('base64'), ...logoFields(row) };
    });
  }

  archiveLogo(actor: StaffActor): Promise<Tenant> {
    return this.writeSetup(actor, async (tx, tenant) => {
      const [row] = await tx
        .update(tenantLogos)
        .set({ archivedAt: new Date() })
        .where(isNull(tenantLogos.archivedAt))
        .returning({ id: tenantLogos.id });
      if (!row) throw notFound('Logo');
      await recordAudit(tx, tenant.id, {
        actor,
        action: 'tenant_logo.archived',
        entityType: 'tenant_logo',
        entityId: row.id,
      });
      return toTenant(tenant);
    });
  }

  /**
   * Rule 2: completes when the Arabic name is set and a branch in use is valid; completing again
   * returns the tenant unchanged.
   */
  completeOnboarding(actor: StaffActor): Promise<Tenant> {
    return this.writeSetup(actor, async (tx, tenant) => {
      if (tenant.onboardingCompletedAt) return toTenant(tenant);
      assertTenantStatusChange(tenant.status as TenantStatus, 'active', 'onboarding');
      const branches = await tx.select().from(facilities).where(isNull(facilities.archivedAt));
      const ready = branches.some((row) => facilitySchema.safeParse(toFacility(row)).success);
      if (tenant.nameAr.trim().length < 2 || !ready) {
        throw new DomainError('ONBOARDING_INCOMPLETE', 'The tenant has no valid branch in use');
      }
      const now = new Date();
      const [row] = await tx
        .update(tenants)
        .set({
          status: 'active',
          statusChangedAt: now,
          onboardingCompletedAt: now,
          updatedAt: nextUpdatedAt(tenant),
        })
        .where(eq(tenants.id, tenant.id))
        .returning();
      await recordAudit(tx, tenant.id, {
        actor,
        action: 'tenant.onboarding_completed',
        entityType: 'tenant',
        entityId: tenant.id,
      });
      return toTenant(row as TenantRow);
    });
  }

  // Clinic: branches.

  listFacilities(
    actor: StaffActor,
    query: Page & { archived: boolean; sort: 'createdAt' | 'name'; order: 'asc' | 'desc' },
  ): Promise<FacilityPage> {
    const by = query.order === 'desc' ? desc : asc;
    const filter = query.archived
      ? isNotNull(facilities.archivedAt)
      : isNull(facilities.archivedAt);
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const [rows, [total]] = await Promise.all([
        tx
          .select()
          .from(facilities)
          .where(filter)
          .orderBy(by(facilities[query.sort]), by(facilities.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        tx.select({ value: count() }).from(facilities).where(filter),
      ]);
      return {
        items: rows.map(toFacility),
        total: total?.value ?? 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  getFacility(actor: StaffActor, id: string): Promise<Facility> {
    return withTenant(this.db, actor.tenantId, async (tx) =>
      toFacility(await this.facilityRow(tx, id)),
    );
  }

  createFacility(actor: StaffActor, input: CreateFacility): Promise<Facility> {
    return this.writeSetup(actor, async (tx, tenant) => {
      await this.assertCity(tx, input.areaId);
      const [row] = await tx
        .insert(facilities)
        .values({ tenantId: tenant.id, type: 'clinic', ...facilityColumns(input) })
        .returning();
      const facility = toFacility(row as FacilityRow);
      await recordAudit(tx, tenant.id, {
        actor,
        action: 'facility.created',
        entityType: 'facility',
        entityId: facility.id,
      });
      return facility;
    });
  }

  updateFacility(actor: StaffActor, id: string, input: UpdateFacility): Promise<Facility> {
    return this.writeSetup(actor, async (tx, tenant) => {
      const current = await this.facilityRow(tx, id, { lock: true });
      assertCurrent(current, input.expectedUpdatedAt);
      // Edge case 4: a branch keeps an area archived after it was chosen.
      if (input.areaId !== current.areaId) await this.assertCity(tx, input.areaId);
      const [row] = await tx
        .update(facilities)
        .set({ ...facilityColumns(input), updatedAt: nextUpdatedAt(current) })
        .where(eq(facilities.id, id))
        .returning();
      await recordAudit(tx, tenant.id, {
        actor,
        action: 'facility.updated',
        entityType: 'facility',
        entityId: id,
      });
      return toFacility(row as FacilityRow);
    });
  }

  /** Rule 7: the last branch in use is never archived. Archiving twice changes nothing. */
  archiveFacility(actor: StaffActor, id: string): Promise<Facility> {
    return this.writeSetup(actor, async (tx, tenant) => {
      const current = await this.facilityRow(tx, id, { lock: true });
      if (current.archivedAt) return toFacility(current);
      const [others] = await tx
        .select({ value: count() })
        .from(facilities)
        .where(and(isNull(facilities.archivedAt), ne(facilities.id, id)));
      if (!others?.value) {
        throw new DomainError('LAST_ACTIVE_FACILITY', 'The last branch in use cannot be archived');
      }
      return this.setArchived(tx, actor, tenant.id, current, new Date());
    });
  }

  /** Rule 8 (the S05 branch limit is checked from S05). Restoring twice changes nothing. */
  restoreFacility(actor: StaffActor, id: string): Promise<Facility> {
    return this.writeSetup(actor, async (tx, tenant) => {
      const current = await this.facilityRow(tx, id, { lock: true });
      if (!current.archivedAt) return toFacility(current);
      return this.setArchived(tx, actor, tenant.id, current, null);
    });
  }

  /** Governorates without `parentId`, else the cities of one; areas in use, by position. */
  async listAreas(parentId: string | undefined): Promise<Area[]> {
    const parent: SQL = parentId ? eq(areas.parentId, parentId) : isNull(areas.parentId);
    const rows = await this.db
      .select()
      .from(areas)
      .where(and(parent, isNull(areas.archivedAt)))
      .orderBy(asc(areas.position));
    return rows.map(toArea);
  }

  /** One area, archived or not: a branch keeps showing the city it chose (edge case 4). */
  async getArea(id: string): Promise<Area> {
    const [row] = await this.db.select().from(areas).where(eq(areas.id, id));
    if (!row) throw notFound('Area');
    return toArea(row);
  }

  async resolveMapLink(actor: StaffActor, url: string): Promise<Coordinates> {
    this.mapLinkLimit.take(actor.tenantId);
    return this.mapLinks.resolve(url);
  }

  // Console and CLI: the tenant registry.

  async listTenants(
    query: Page & {
      status?: TenantStatus | undefined;
      sort: 'createdAt' | 'nameAr' | 'statusChangedAt';
      order: 'asc' | 'desc';
    },
  ): Promise<TenantPage> {
    const by = query.order === 'desc' ? desc : asc;
    const filter = query.status ? eq(tenants.status, query.status) : undefined;
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(tenants)
        .where(filter)
        .orderBy(by(tenants[query.sort]), by(tenants.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ value: count() }).from(tenants).where(filter),
    ]);
    return {
      items: rows.map(toTenant),
      total: total?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Rule 1: in `onboarding`, without a branch (the wizard adds it). One tenant per call. */
  createTenant(actor: StaffOfVertex, input: CreateTenant): Promise<Tenant> {
    const id = uuidv7();
    return withTenant(this.db, id, async (tx) => {
      const [row] = await tx
        .insert(tenants)
        .values({ id, nameAr: input.nameAr, nameLatin: input.nameLatin ?? null })
        .returning();
      await recordAudit(tx, id, {
        actor,
        action: 'tenant.created',
        entityType: 'tenant',
        entityId: id,
        reason: input.reason,
      });
      return toTenant(row as TenantRow);
    });
  }

  changeTenantStatus(actor: StaffOfVertex, id: string, input: ChangeTenantStatus): Promise<Tenant> {
    return withTenant(this.db, id, async (tx) => {
      const tenant = await this.tenantRow(tx, id, { lock: true });
      assertTenantStatusChange(tenant.status as TenantStatus, input.status, 'platform');
      const now = new Date();
      const readOnly = input.status === 'suspended' || input.status === 'closed';
      const [row] = await tx
        .update(tenants)
        .set({
          status: input.status,
          statusReason: readOnly ? input.reasonCategory : null,
          statusChangedAt: now,
          archivedAt: input.status === 'closed' ? now : null,
          updatedAt: nextUpdatedAt(tenant),
        })
        .where(eq(tenants.id, id))
        .returning();
      await recordAudit(tx, id, {
        actor,
        action: 'tenant.status_changed',
        entityType: 'tenant',
        entityId: id,
        reason: input.reason,
      });
      return toTenant(row as TenantRow);
    });
  }

  setDirectoryListing(
    actor: StaffOfVertex,
    id: string,
    input: SetTenantDirectoryListing,
  ): Promise<Tenant> {
    return withTenant(this.db, id, async (tx) => {
      const tenant = await this.tenantRow(tx, id, { lock: true });
      const [row] = await tx
        .update(tenants)
        .set({ directoryListed: input.listed, updatedAt: nextUpdatedAt(tenant) })
        .where(eq(tenants.id, id))
        .returning();
      await recordAudit(tx, id, {
        actor,
        action: 'tenant.directory_listing_changed',
        entityType: 'tenant',
        entityId: id,
        reason: input.reason,
      });
      return toTenant(row as TenantRow);
    });
  }

  // Shared write paths.

  /**
   * A change to the clinic's setup by its staff: in the tenant's transaction, with the tenant row
   * locked, refused while suspended or closed (rule 5).
   */
  private writeSetup<T>(
    actor: StaffActor,
    work: (tx: Transaction, tenant: TenantRow) => Promise<T>,
  ): Promise<T> {
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const tenant = await this.tenantRow(tx, actor.tenantId, { lock: true });
      assertTenantWritable(tenant.status as TenantStatus);
      return work(tx, tenant);
    });
  }

  private async tenantRow(tx: Transaction, id: string, options: { lock?: boolean } = {}) {
    const query = tx.select().from(tenants).where(eq(tenants.id, id));
    const [row] = await (options.lock ? query.for('update') : query);
    if (!row) throw notFound('Tenant');
    return row;
  }

  /** RLS hides another tenant's branch, so its id is `NOT_FOUND` like an unknown one. */
  private async facilityRow(tx: Transaction, id: string, options: { lock?: boolean } = {}) {
    const query = tx.select().from(facilities).where(eq(facilities.id, id));
    const [row] = await (options.lock ? query.for('update') : query);
    if (!row) throw notFound('Branch');
    return row;
  }

  private async assertCity(tx: Transaction, areaId: string) {
    const [area] = await tx
      .select({ id: areas.id })
      .from(areas)
      .where(and(eq(areas.id, areaId), eq(areas.level, 'city'), isNull(areas.archivedAt)));
    if (!area) throw new DomainError('VALIDATION_FAILED', 'The area is not a city in use');
  }

  private async setArchived(
    tx: Transaction,
    actor: Actor,
    tenantId: string,
    current: FacilityRow,
    archivedAt: Date | null,
  ) {
    const id = current.id;
    const [row] = await tx
      .update(facilities)
      .set({ archivedAt, updatedAt: nextUpdatedAt(current) })
      .where(eq(facilities.id, id))
      .returning();
    await recordAudit(tx, tenantId, {
      actor,
      action: archivedAt ? 'facility.archived' : 'facility.restored',
      entityType: 'facility',
      entityId: id,
    });
    return toFacility(row as FacilityRow);
  }
}

function logoFields(logo: { byteSize: number; width: number; height: number; sha256: string }) {
  return { byteSize: logo.byteSize, width: logo.width, height: logo.height, sha256: logo.sha256 };
}
