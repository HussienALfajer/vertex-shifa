import { randomUUID } from 'node:crypto';
import type { Request, Route } from '@playwright/test';
import {
  accessCatalog,
  assertAdjustmentsAllowed,
  canResendInvitation,
  changeStaffAccessSchema,
  createInvitationSchema,
  DomainError,
  deactivateStaffSchema,
  type ErrorCode,
  effectivePermissions,
  errorStatus,
  invitationSentAt,
  type ManagedDevice,
  type PermissionKey,
  type PractitionerProfileInput,
  renameDeviceSchema,
  revokeDeviceSchema,
  type Specialty,
  type StaffMember,
  updatePractitionerSchema,
  updateTenantSecuritySchema,
} from '@vertex-shifa/contracts';
import { logoPng, type MockApi } from './mock-api.js';
import {
  type Account,
  addMember,
  type Membership,
  practitionerOf,
  type Session,
} from './mock-identity.js';

/**
 * The staff, doctor profile, device management and security routes of `apps/api/openapi.json`
 * (spec S02, PR 3), in memory, with the rules the screens react to: owner-only staff writes,
 * `ALREADY_MEMBER`, `LAST_OWNER`, `PERMISSION_NOT_GRANTABLE`, the resend cooldown (`RATE_LIMITED`),
 * `CONFLICT` on a stale `updatedAt`, invitations only while the clinic is active, and
 * `devices.manage`. Synthetic data only.
 */

let sequence = 0;

/** Strictly advancing instants, like the API's `updatedAt`. */
function now(): string {
  sequence += 1;
  return new Date(Date.now() + sequence).toISOString();
}

let specialtyIds = 0;
const specialty = (code: string, nameAr: string, nameLatin: string): Specialty => {
  specialtyIds += 1;
  return {
    id: `0199f000-0000-7000-8000-0000000003${specialtyIds.toString(16).padStart(2, '0')}`,
    code,
    nameAr,
    nameLatin,
    position: specialtyIds,
  };
};

/** A few of the platform's specialties (public names, `specialties` seed). */
export const specialties: Specialty[] = [
  specialty('general-practice', 'طب عام', 'General practice'),
  specialty('internal-medicine', 'باطنية', 'Internal medicine'),
  specialty('pediatrics', 'طب الأطفال', 'Pediatrics'),
  specialty('cardiology', 'قلبية', 'Cardiology'),
  specialty('general-dentistry', 'طب الأسنان العام', 'General dentistry'),
];

/** A photo as the API keeps it; the mock's image is the synthetic PNG of `mock-api.ts`. */
const storedPhoto = (data: string) => ({
  contentType: 'image/jpeg' as const,
  data,
  byteSize: Buffer.from(data, 'base64').length,
  width: 128,
  height: 128,
  sha256: '0'.repeat(64),
});

type Answer = (route: Route) => Promise<void>;

export function staffRoutes(state: MockApi) {
  const { identity } = state;
  const photos = new Map<string, string>();
  const refuse =
    (code: ErrorCode): Answer =>
    (route) =>
      route.fulfill({ status: errorStatus[code], json: { code, message: code } });
  const ok =
    (json: unknown, status = 200): Answer =>
    (route) =>
      route.fulfill({ status, json });

  const tenantMembers = () =>
    identity.accounts.flatMap((account) =>
      account.memberships
        .filter((membership) => membership.tenantId === state.tenant.id)
        .map((membership) => ({ account, membership })),
    );
  const find = (id: string) => tenantMembers().find(({ membership }) => membership.id === id);
  const permissionsOf = (membership: Membership) =>
    effectivePermissions(membership.roles, membership.granted, membership.revoked);

  function toMember(account: Account, membership: Membership): StaffMember {
    const accepted = membership.status !== 'invited' && !membership.archivedAt;
    return {
      id: membership.id,
      name: (accepted ? account.name : null) ?? account.invitedName,
      phone: account.phone,
      status: membership.status,
      roles: membership.roles,
      branchScope: membership.allFacilities
        ? { allFacilities: true }
        : { allFacilities: false, facilityIds: membership.facilityIds },
      adjustments: { granted: membership.granted, revoked: membership.revoked },
      permissions: permissionsOf(membership),
      practitionerId: practitionerOf(identity, membership.id)?.id ?? null,
      invitationExpiresAt: membership.invitationExpiresAt,
      invitationMessageStatus: membership.invitationMessageStatus,
      acceptedAt: membership.acceptedAt,
      deactivatedAt: membership.deactivatedAt,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
      archivedAt: membership.archivedAt,
    };
  }

  function toDevice(device: (typeof identity.devices)[number]): ManagedDevice {
    const registeredAt = '2026-10-17T10:00:00.000Z';
    return {
      id: device.id,
      facilityId: device.facilityId,
      name: device.name,
      status: device.status,
      os: 'Windows 11',
      appVersion: '0.1.0',
      lastSeenAt: '2026-10-18T08:30:00.000Z',
      registeredAt,
      revokedAt: device.revokedAt ?? null,
      wipedAt: device.wipedAt,
      updatedAt: registeredAt,
      members: identity.enrollments
        .filter((item) => item.deviceId === device.id && !item.revokedAt)
        .flatMap((item) => {
          const found = find(item.membershipId);
          if (!found) return [];
          return [
            {
              enrollmentId: item.id,
              membershipId: item.membershipId,
              name: found.account.name ?? found.account.invitedName,
              roles: found.membership.roles,
              lastConfirmedAt: item.lastConfirmedAt,
            },
          ];
        }),
    };
  }

  /** Rule 1 and edge case 11: the doctor role brings its profile; its removal archives it. */
  function assignPractitioner(
    membershipId: string,
    profile: PractitionerProfileInput | undefined,
  ): ErrorCode | undefined {
    if (practitionerOf(identity, membershipId)) return;
    const archived = identity.practitioners.find((item) => item.membershipId === membershipId);
    if (archived) {
      Object.assign(archived, profile ?? {}, { archivedAt: null, updatedAt: now() });
      return;
    }
    if (!profile) return 'VALIDATION_FAILED';
    const at = now();
    identity.practitioners.push({
      id: randomUUID(),
      membershipId,
      ...profile,
      hasPhoto: false,
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
    });
  }

  const otherActiveOwners = (id: string) =>
    tenantMembers().filter(
      ({ membership }) =>
        membership.id !== id &&
        membership.status === 'active' &&
        !membership.archivedAt &&
        membership.roles.includes('owner'),
    ).length;

  /** Rule 8: the member's sessions end and their enrollments go. */
  function cutOff(membershipId: string) {
    for (const session of identity.sessions) {
      if (session.membershipId === membershipId) session.ended = true;
    }
    for (const enrollment of identity.enrollments) {
      if (enrollment.membershipId === membershipId) enrollment.revokedAt ??= now();
    }
  }

  function guard(permissions: PermissionKey[], needed: PermissionKey): ErrorCode | undefined {
    return permissions.includes(needed) ? undefined : 'FORBIDDEN';
  }

  /** Answers the routes of this file; `undefined` for every other path. */
  return function handle(
    request: Request,
    path: string,
    method: string,
    session: Session,
  ): Answer | undefined {
    const body = () => request.postDataJSON() as unknown;
    // A member of another clinic on the same computer: the S01 routes answer as before.
    const actor = find(session.membershipId)?.membership;
    if (!actor) return undefined;
    const permissions = permissionsOf(actor);

    if (path === '/api/access/catalog' && method === 'GET') {
      return permissions.includes('tenant.read') ? ok(accessCatalog()) : refuse('FORBIDDEN');
    }
    if (path === '/api/specialties' && method === 'GET') {
      return permissions.includes('practitioners.read') ? ok(specialties) : refuse('FORBIDDEN');
    }

    if (path === '/api/staff' && method === 'GET') {
      const forbidden = guard(permissions, 'staff.read');
      if (forbidden) return refuse(forbidden);
      const url = new URL(request.url());
      const status = url.searchParams.get('status');
      const items = tenantMembers()
        .filter(({ membership }) => !membership.archivedAt)
        .filter(({ membership }) => !status || membership.status === status)
        .map(({ account, membership }) => toMember(account, membership));
      return ok({ items, total: items.length, page: 1, pageSize: 100 });
    }

    if (path === '/api/staff/invitations' && method === 'POST') {
      const forbidden = guard(permissions, 'staff.manage');
      if (forbidden) return refuse(forbidden);
      const parsed = createInvitationSchema.safeParse(body());
      if (!parsed.success) return refuse('VALIDATION_FAILED');
      if (state.tenant.status === 'suspended') return refuse('TENANT_SUSPENDED');
      if (state.tenant.status === 'closed') return refuse('TENANT_CLOSED');
      const input = parsed.data;
      try {
        assertAdjustmentsAllowed(input.roles, input.adjustments.granted, input.adjustments.revoked);
      } catch (error) {
        if (error instanceof DomainError) return refuse(error.code);
        throw error;
      }
      const existing = tenantMembers().find(({ account }) => account.phone === input.phone);
      if (existing && !existing.membership.archivedAt) return refuse('ALREADY_MEMBER');
      const account =
        existing?.account ??
        addMember(identity, {
          tenantId: state.tenant.id,
          phone: input.phone,
          name: input.name,
          roles: input.roles,
          password: null,
        });
      const membership = existing?.membership ?? (account.memberships.at(-1) as Membership);
      Object.assign(membership, {
        status: 'invited',
        roles: input.roles,
        allFacilities: input.branchScope.allFacilities,
        facilityIds: input.branchScope.allFacilities ? [] : input.branchScope.facilityIds,
        granted: input.adjustments.granted,
        revoked: input.adjustments.revoked,
        invitationExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        invitationMessageStatus: 'pending',
        archivedAt: null,
        updatedAt: now(),
      });
      account.invitedName = input.name;
      if (input.roles.includes('doctor')) {
        const refused = assignPractitioner(membership.id, input.practitioner);
        if (refused) return refuse(refused);
      }
      return ok(toMember(account, membership), 201);
    }

    const memberPath =
      /^\/api\/staff\/([^/]+)(?:\/(access|deactivate|reactivate|password-reset|previous-practitioner|invitation\/resend|invitation\/cancel))?$/.exec(
        path,
      );
    if (memberPath) {
      const [, id, action] = memberPath;
      const reads = method === 'GET' && action !== 'previous-practitioner';
      const forbidden = guard(permissions, reads ? 'staff.read' : 'staff.manage');
      if (forbidden) return refuse(forbidden);
      const found = find(id as string);
      if (!found) return refuse('NOT_FOUND');
      const { account, membership } = found;
      const answer = () => ok(toMember(account, membership), method === 'POST' ? 201 : 200);
      if (method === 'GET' && !action) return answer();
      if (method === 'GET' && action === 'previous-practitioner') {
        // Rule 9: the latest archived profile and its photo, while there is no current one.
        const archived = practitionerOf(identity, membership.id)
          ? undefined
          : identity.practitioners
              .filter((item) => item.membershipId === membership.id && item.archivedAt)
              .at(-1);
        if (!archived) return ok({ practitioner: null, photo: null });
        const { archivedAt: _, ...practitioner } = archived;
        const data = photos.get(archived.id);
        return ok({ practitioner, photo: data ? storedPhoto(data) : null });
      }
      const touch = (changes: Partial<Membership>) =>
        Object.assign(membership, changes, { updatedAt: now() });
      const invalid = () => refuse('INVALID_STATUS_TRANSITION');
      if (membership.archivedAt) return action === 'access' ? refuse('NOT_FOUND') : invalid();

      if (action === 'invitation/resend' && method === 'POST') {
        if (membership.status !== 'invited') return invalid();
        const sentAt = invitationSentAt(new Date(membership.invitationExpiresAt as string));
        if (!canResendInvitation(sentAt, new Date())) return refuse('RATE_LIMITED');
        if (state.tenant.status !== 'active') return refuse('TENANT_SUSPENDED');
        touch({
          invitationExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          invitationMessageStatus: 'pending',
        });
        return answer();
      }
      if (action === 'invitation/cancel' && method === 'POST') {
        if (membership.status !== 'invited') return invalid();
        touch({ archivedAt: now() });
        const profile = identity.practitioners.find((item) => item.membershipId === membership.id);
        if (profile) profile.archivedAt ??= now();
        return answer();
      }
      if (action === 'access' && method === 'PATCH') {
        const parsed = changeStaffAccessSchema.safeParse(body());
        if (!parsed.success) return refuse('VALIDATION_FAILED');
        const input = parsed.data;
        if (input.expectedUpdatedAt !== membership.updatedAt) return refuse('CONFLICT');
        try {
          assertAdjustmentsAllowed(
            input.roles,
            input.adjustments.granted,
            input.adjustments.revoked,
          );
        } catch (error) {
          if (error instanceof DomainError) return refuse(error.code);
          throw error;
        }
        const losesOwner = membership.roles.includes('owner') && !input.roles.includes('owner');
        if (losesOwner && membership.status === 'active' && otherActiveOwners(membership.id) < 1) {
          return refuse('LAST_OWNER');
        }
        if (input.roles.includes('doctor') && !membership.roles.includes('doctor')) {
          const refused = assignPractitioner(membership.id, input.practitioner);
          if (refused) return refuse(refused);
        }
        if (!input.roles.includes('doctor')) {
          const profile = practitionerOf(identity, membership.id);
          const stored = identity.practitioners.find((item) => item.id === profile?.id);
          if (stored) stored.archivedAt = now();
        }
        touch({
          roles: input.roles,
          allFacilities: input.branchScope.allFacilities,
          facilityIds: input.branchScope.allFacilities ? [] : input.branchScope.facilityIds,
          granted: input.adjustments.granted,
          revoked: input.adjustments.revoked,
        });
        return answer();
      }
      if (action === 'deactivate' && method === 'POST') {
        if (!deactivateStaffSchema.safeParse(body()).success) return refuse('VALIDATION_FAILED');
        if (membership.status !== 'active') return invalid();
        if (membership.roles.includes('owner') && otherActiveOwners(membership.id) < 1) {
          return refuse('LAST_OWNER');
        }
        touch({ status: 'deactivated', deactivatedAt: now() });
        cutOff(membership.id);
        return answer();
      }
      if (action === 'reactivate' && method === 'POST') {
        if (membership.status !== 'deactivated') return invalid();
        touch({ status: 'active', deactivatedAt: null });
        return answer();
      }
      if (action === 'password-reset' && method === 'POST') {
        if (membership.status !== 'active') return invalid();
        account.resetUntil = Date.now() + 72 * 3_600_000;
        return ok(
          { passwordResetAuthorizedUntil: new Date(account.resetUntil).toISOString() },
          201,
        );
      }
      return refuse('NOT_FOUND');
    }

    const practitionerPath = /^\/api\/practitioners\/([^/]+)(\/photo)?$/.exec(path);
    if (practitionerPath) {
      const [, id, photo] = practitionerPath;
      const stored = identity.practitioners.find(
        (item) => item.id === id && item.archivedAt === null,
      );
      if (!stored) return refuse('NOT_FOUND');
      const { archivedAt: _, ...practitioner } = stored;
      if (method === 'GET') {
        if (!permissions.includes('practitioners.read')) return refuse('FORBIDDEN');
        if (!photo) return ok(practitioner);
        const data = photos.get(stored.id);
        return data ? ok(storedPhoto(data)) : refuse('NOT_FOUND');
      }
      const own = stored.membershipId === actor.id && permissions.includes('practitioner.edit_own');
      if (!own && !permissions.includes('staff.manage')) return refuse('FORBIDDEN');
      if (method === 'PATCH' && !photo) {
        const parsed = updatePractitionerSchema.safeParse(body());
        if (!parsed.success) return refuse('VALIDATION_FAILED');
        if (parsed.data.expectedUpdatedAt !== stored.updatedAt) return refuse('CONFLICT');
        const { expectedUpdatedAt: __, ...profile } = parsed.data;
        Object.assign(stored, profile, { updatedAt: now() });
        return ok(practitionerOf(identity, stored.membershipId));
      }
      if (method === 'PUT' && photo) {
        if (!request.headers()['content-type']?.startsWith('multipart/form-data')) {
          return refuse('FILE_REJECTED');
        }
        // The synthetic image stands in for the upload re-encoded as a JPEG.
        const data = logoPng.toString('base64');
        photos.set(stored.id, data);
        stored.hasPhoto = true;
        return ok(storedPhoto(data));
      }
      if (method === 'DELETE' && photo) {
        if (!photos.delete(stored.id)) return refuse('NOT_FOUND');
        stored.hasPhoto = false;
        return ok(practitionerOf(identity, stored.membershipId));
      }
      return refuse('NOT_FOUND');
    }

    if (path === '/api/devices' && method === 'GET') {
      const forbidden = guard(permissions, 'devices.manage');
      if (forbidden) return refuse(forbidden);
      const status = new URL(request.url()).searchParams.get('status');
      return ok(
        identity.devices
          .filter((device) => device.tenantId === state.tenant.id)
          .filter((device) => !status || device.status === status)
          .map(toDevice),
      );
    }

    const devicePath =
      /^\/api\/devices\/([^/]+)(?:\/(revoke)|\/enrollments\/([^/]+)\/revoke)?$/.exec(path);
    if (devicePath) {
      const [, id, revoke, enrollmentId] = devicePath;
      const forbidden = guard(permissions, 'devices.manage');
      if (forbidden) return refuse(forbidden);
      const device = identity.devices.find(
        (item) => item.id === id && item.tenantId === state.tenant.id,
      );
      if (!device) return refuse('NOT_FOUND');
      if (method === 'GET' && !revoke && !enrollmentId) return ok(toDevice(device));
      if (method === 'PATCH' && !revoke && !enrollmentId) {
        const parsed = renameDeviceSchema.safeParse(body());
        if (!parsed.success) return refuse('VALIDATION_FAILED');
        device.name = parsed.data.name;
        return ok(toDevice(device));
      }
      if (method === 'POST' && revoke) {
        if (!revokeDeviceSchema.safeParse(body()).success) return refuse('VALIDATION_FAILED');
        if (device.status !== 'active') return refuse('INVALID_STATUS_TRANSITION');
        identity.revoke(device.id);
        return ok(toDevice(device), 201);
      }
      if (method === 'POST' && enrollmentId) {
        const enrollment = identity.enrollments.find(
          (item) => item.id === enrollmentId && item.deviceId === device.id && !item.revokedAt,
        );
        if (!enrollment) return refuse('NOT_FOUND');
        enrollment.revokedAt = now();
        for (const item of identity.sessions) {
          if (item.enrollmentId === enrollment.id) item.ended = true;
        }
        return ok(
          {
            id: enrollment.id,
            deviceId: device.id,
            membershipId: enrollment.membershipId,
            revokedAt: enrollment.revokedAt,
            revokeReason: 'removed_from_device',
          },
          201,
        );
      }
      return refuse('NOT_FOUND');
    }

    if (path === '/api/tenant/security' && method === 'PATCH') {
      const forbidden = guard(permissions, 'tenant.manage');
      if (forbidden) return refuse(forbidden);
      const parsed = updateTenantSecuritySchema.safeParse(body());
      if (!parsed.success) return refuse('VALIDATION_FAILED');
      if (state.tenant.status === 'closed') return refuse('TENANT_CLOSED');
      if (parsed.data.expectedUpdatedAt !== state.tenant.updatedAt) return refuse('CONFLICT');
      state.tenant = {
        ...state.tenant,
        idleLockMinutes: parsed.data.idleLockMinutes,
        clinicalReadScope: parsed.data.clinicalReadScope,
        updatedAt: now(),
      };
      return ok(state.tenant);
    }

    return undefined;
  };
}
