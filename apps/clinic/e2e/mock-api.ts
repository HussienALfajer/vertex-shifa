import { crc32, deflateSync } from 'node:zlib';
import type { Page, Route } from '@playwright/test';
import {
  type Area,
  createFacilitySchema,
  type ErrorCode,
  errorStatus,
  type Facility,
  isShownInDirectory,
  type Tenant,
  type TenantLogo,
  updateFacilitySchema,
  updateTenantProfileSchema,
} from '@vertex-shifa/contracts';
import { type DeviceBridge, installDeviceBridge } from './device-bridge.js';
import {
  type Account,
  addMember,
  type Clinic,
  createIdentity,
  identityRoutes,
  type MockIdentity,
  ownerPassword,
  ownerPhone,
  signInBeforehand,
} from './mock-identity.js';

/**
 * An in-memory stand-in for the API. It answers the routes of `apps/api/openapi.json` the clinic
 * calls, validates bodies with the same contracts, and applies the rules the screens react to
 * (suspended or closed writes, `CONFLICT` on a stale `updatedAt`, `LAST_ACTIVE_FACILITY`,
 * `ONBOARDING_INCOMPLETE`); every staff route needs the session of a member signed in on the
 * device bridge (S02, `mock-identity.ts`). Synthetic data only.
 */
export type MockApi = {
  /** Sign-in, devices and sessions (S02). */
  identity: MockIdentity;
  /** The desktop app's device bridge, in the test's process. */
  device: DeviceBridge;
  /** The clinic's owner, signed in on the device before the page opens unless `signedIn: false`. */
  owner: Account;
  /** The clinic's tenant id in the identity routes. */
  clinic: Clinic;
  tenant: Tenant;
  logo: TenantLogo | null;
  facilities: Facility[];
  areas: Area[];
  /** Every write the clinic sent, as `METHOD path`. */
  writes: string[];
  /** Makes the next completion fail as the API does without a valid branch. */
  failCompletion: boolean;
  /** Creates the next branch, then drops the connection before the answer reaches the clinic. */
  loseNextCreateAnswer: boolean;
  /** The area lists answer with a server error. */
  failAreas: boolean;
  /** Every write waits this long before it is answered. */
  writeDelayMs: number;
  /** Another owner's edit: the record changes on the server behind the screen's back. */
  editBehind: (change: (state: MockApi) => void) => void;
};

let clock = Date.parse('2026-10-18T09:00:00.000Z');

/** Strictly advancing instants, like the API's `updatedAt`. */
function now(): string {
  clock += 1000;
  return new Date(clock).toISOString();
}

let sequence = 0;

/** A synthetic UUIDv7. */
export function syntheticId(): string {
  sequence += 1;
  return `0199f000-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

export const areas = {
  aleppo: syntheticId(),
  idlib: syntheticId(),
  azaz: syntheticId(),
  mare: syntheticId(),
  alBab: syntheticId(),
  /** Archived after a branch chose it (edge case 4). */
  tallRifaat: syntheticId(),
};

function seedAreas(): Area[] {
  const area = (
    id: string,
    nameAr: string,
    nameLatin: string,
    parentId: string | null,
    archivedAt: string | null = null,
  ): Area => ({
    id,
    parentId,
    level: parentId ? 'city' : 'governorate',
    nameAr,
    nameLatin,
    archivedAt,
  });
  return [
    area(areas.aleppo, 'حلب', 'Aleppo', null),
    area(areas.idlib, 'إدلب', 'Idlib', null),
    area(areas.azaz, 'أعزاز', 'Azaz', areas.aleppo),
    area(areas.mare, 'مارع', "Mare'", areas.aleppo),
    area(areas.alBab, 'الباب', 'Al-Bab', areas.aleppo),
    area(areas.tallRifaat, 'تل رفعت', 'Tall Rifaat', areas.aleppo, '2026-10-01T00:00:00.000Z'),
  ];
}

export function tenant(overrides: Partial<Tenant> = {}): Tenant {
  const created = '2026-10-17T09:00:00.000Z';
  return {
    id: syntheticId(),
    nameAr: 'عيادة الاختبار',
    nameLatin: null,
    status: 'onboarding',
    statusReason: null,
    statusChangedAt: created,
    onboardingCompletedAt: null,
    directoryListed: false,
    directoryShown: false,
    idleLockMinutes: 15,
    clinicalReadScope: 'branch',
    createdAt: created,
    updatedAt: created,
    archivedAt: null,
    ...overrides,
  };
}

/** A branch as the API returns it; synthetic numbers in the reserved-looking `+963 900…` range. */
export function facility(overrides: Partial<Facility> = {}): Facility {
  const created = '2026-10-17T10:00:00.000Z';
  return {
    id: syntheticId(),
    type: 'clinic',
    name: 'عيادة الاختبار',
    areaId: areas.azaz,
    addressDetails: 'الحي الشمالي، شارع المدرسة، بناء 3',
    coordinates: { latitudeE7: 365_866_000, longitudeE7: 370_469_000 },
    contactPhones: [{ phone: '+963900000001', whatsapp: true }],
    defaultCurrency: 'TRY',
    workingDays: 0b0111111,
    displayNameFormat: 'ticket_only',
    displayCallSound: true,
    createdAt: created,
    updatedAt: '2026-10-17T11:00:00.000Z',
    archivedAt: null,
    ...overrides,
  };
}

/** A 16 × 16 PNG of one gray, made here so no image file sits in the repository. */
function syntheticPng(): string {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(16, 0);
  header.writeUInt32BE(16, 4);
  header.set([8, 0, 0, 0, 0], 8); // 8-bit grayscale
  const rows = Buffer.alloc(16 * 17, 0x80);
  for (let row = 0; row < 16; row += 1) rows[row * 17] = 0; // filter byte of each row
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

export const logoPng = Buffer.from(syntheticPng(), 'base64');

function logo(): TenantLogo {
  return {
    contentType: 'image/png',
    data: logoPng.toString('base64'),
    byteSize: logoPng.length,
    width: 16,
    height: 16,
    sha256: '0'.repeat(64),
  };
}

/** Where the mocked resolver says the synthetic short link points. */
export const shortLink = 'https://maps.app.goo.gl/SyntheticTestLink';

export async function mockApi(
  page: Page,
  seed: {
    tenant: Tenant;
    facilities?: Facility[];
    logo?: boolean;
    /** The owner is signed in on the device before the page opens (default), or not. */
    signedIn?: boolean;
    /** Invited by `tenant:create --owner-phone`, before their first sign-in. */
    ownerInvited?: boolean;
  },
): Promise<MockApi> {
  const device = await installDeviceBridge(page);
  const clinic: Clinic = {
    tenantId: seed.tenant.id,
    get nameAr() {
      return state.tenant.nameAr;
    },
    get nameLatin() {
      return state.tenant.nameLatin;
    },
    get status() {
      return state.tenant.status;
    },
    get idleLockMinutes() {
      return state.tenant.idleLockMinutes;
    },
    get branches() {
      return state.facilities
        .filter((branch) => branch.archivedAt === null)
        .map((branch) => ({ id: branch.id, name: branch.name }));
    },
  };
  const identity = createIdentity([clinic]);
  const owner = addMember(identity, {
    tenantId: seed.tenant.id,
    phone: ownerPhone,
    name: 'مالك تجريبي',
    roles: ['owner'],
    password: seed.ownerInvited ? null : ownerPassword,
  });
  const state: MockApi = {
    identity,
    device,
    owner,
    clinic,
    tenant: seed.tenant,
    logo: seed.logo ? logo() : null,
    facilities: seed.facilities ?? [],
    areas: seedAreas(),
    writes: [],
    failCompletion: false,
    loseNextCreateAnswer: false,
    failAreas: false,
    writeDelayMs: 0,
    editBehind: (change) => change(state),
  };
  if (seed.signedIn !== false && !seed.ownerInvited)
    await signInBeforehand(identity, device, owner, seed.tenant.id);
  const sessions = identityRoutes(identity);

  const refuse = (route: Route, code: ErrorCode) =>
    route.fulfill({ status: errorStatus[code], json: { code, message: code } });
  const writable = (route: Route) => {
    if (state.tenant.status === 'suspended') return refuse(route, 'TENANT_SUSPENDED');
    if (state.tenant.status === 'closed') return refuse(route, 'TENANT_CLOSED');
  };
  const touchTenant = () => {
    state.tenant = {
      ...state.tenant,
      updatedAt: now(),
      directoryShown: isShownInDirectory(state.tenant),
    };
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = () => request.postDataJSON() as unknown;
    const signIn = sessions.handle(request, path, method);
    if (signIn) return signIn(route);
    const session = sessions.staff(request);
    if (typeof session === 'string') return refuse(route, session);
    if (method !== 'GET') {
      state.writes.push(`${method} ${path}`);
      if (state.writeDelayMs) await new Promise((done) => setTimeout(done, state.writeDelayMs));
    }

    if (path === '/api/tenant' && method === 'GET') return route.fulfill({ json: state.tenant });

    if (path === '/api/tenant/profile' && method === 'PATCH') {
      const parsed = updateTenantProfileSchema.safeParse(body());
      if (!parsed.success) return refuse(route, 'VALIDATION_FAILED');
      const refused = writable(route);
      if (refused) return refused;
      if (parsed.data.expectedUpdatedAt !== state.tenant.updatedAt)
        return refuse(route, 'CONFLICT');
      state.tenant = {
        ...state.tenant,
        nameAr: parsed.data.nameAr,
        nameLatin: parsed.data.nameLatin,
      };
      touchTenant();
      return route.fulfill({ json: state.tenant });
    }

    if (path === '/api/tenant/logo') {
      if (method === 'GET') {
        return state.logo ? route.fulfill({ json: state.logo }) : refuse(route, 'NOT_FOUND');
      }
      const refused = writable(route);
      if (refused) return refused;
      if (method === 'PUT') {
        if (!request.headers()['content-type']?.startsWith('multipart/form-data')) {
          return refuse(route, 'FILE_REJECTED');
        }
        state.logo = logo();
        return route.fulfill({ json: state.logo });
      }
      if (method === 'DELETE') {
        if (!state.logo) return refuse(route, 'NOT_FOUND');
        state.logo = null;
        return route.fulfill({ json: state.tenant });
      }
    }

    if (path === '/api/tenant/onboarding/complete' && method === 'POST') {
      const refused = writable(route);
      if (refused) return refused;
      if (state.tenant.onboardingCompletedAt) return route.fulfill({ json: state.tenant });
      if (state.failCompletion || !state.facilities.some((branch) => !branch.archivedAt)) {
        return refuse(route, 'ONBOARDING_INCOMPLETE');
      }
      const at = now();
      state.tenant = {
        ...state.tenant,
        status: 'active',
        statusChangedAt: at,
        onboardingCompletedAt: at,
      };
      touchTenant();
      return route.fulfill({ json: state.tenant });
    }

    if (path === '/api/facilities') {
      if (method === 'GET') {
        const archived = url.searchParams.get('archived') === 'true';
        const items = state.facilities.filter(
          (branch) => (branch.archivedAt !== null) === archived,
        );
        return route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 100 } });
      }
      if (method === 'POST') {
        const parsed = createFacilitySchema.safeParse(body());
        if (!parsed.success) return refuse(route, 'VALIDATION_FAILED');
        const refused = writable(route);
        if (refused) return refused;
        const at = now();
        const created: Facility = {
          ...parsed.data,
          id: syntheticId(),
          type: 'clinic',
          createdAt: at,
          updatedAt: at,
          archivedAt: null,
        };
        state.facilities.push(created);
        // Rule 28: the onboarding wizard's first branch places the clinic's computers.
        for (const registered of identity.devices) {
          if (registered.tenantId === state.tenant.id) registered.facilityId ??= created.id;
        }
        if (state.loseNextCreateAnswer) {
          state.loseNextCreateAnswer = false;
          return route.abort('connectionreset');
        }
        return route.fulfill({ status: 201, json: created });
      }
    }

    const branchPath = /^\/api\/facilities\/([^/]+)(?:\/(archive|restore))?$/.exec(path);
    if (branchPath) {
      const [, id, action] = branchPath;
      const index = state.facilities.findIndex((branch) => branch.id === id);
      const current = state.facilities[index];
      if (!current) return refuse(route, 'NOT_FOUND');
      if (method === 'GET' && !action) return route.fulfill({ json: current });
      const refused = writable(route);
      if (refused) return refused;
      let next: Facility | undefined;
      if (method === 'PATCH' && !action) {
        const parsed = updateFacilitySchema.safeParse(body());
        if (!parsed.success) return refuse(route, 'VALIDATION_FAILED');
        if (parsed.data.expectedUpdatedAt !== current.updatedAt) return refuse(route, 'CONFLICT');
        const { expectedUpdatedAt: _, ...fields } = parsed.data;
        next = { ...current, ...fields, updatedAt: now() };
      } else if (method === 'POST' && action === 'archive') {
        const inUse = state.facilities.filter((branch) => !branch.archivedAt);
        if (!current.archivedAt && inUse.length === 1) return refuse(route, 'LAST_ACTIVE_FACILITY');
        next = { ...current, archivedAt: current.archivedAt ?? now(), updatedAt: now() };
      } else if (method === 'POST' && action === 'restore') {
        next = { ...current, archivedAt: null, updatedAt: now() };
      }
      if (!next) return refuse(route, 'NOT_FOUND');
      state.facilities[index] = next;
      return route.fulfill({ json: next });
    }

    if (path === '/api/areas' && method === 'GET') {
      if (state.failAreas) return refuse(route, 'INTERNAL_ERROR');
      const parentId = url.searchParams.get('parentId');
      const items = state.areas
        .filter((area) => area.parentId === parentId && area.archivedAt === null)
        .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
      return route.fulfill({ json: items });
    }

    const areaPath = /^\/api\/areas\/([^/]+)$/.exec(path);
    if (areaPath && method === 'GET') {
      const found = state.areas.find((area) => area.id === areaPath[1]);
      return found ? route.fulfill({ json: found }) : refuse(route, 'NOT_FOUND');
    }

    if (path === '/api/maps/resolve-link' && method === 'POST') {
      const { url: link } = body() as { url: string };
      return link === shortLink
        ? route.fulfill({ json: { latitudeE7: 365_870_000, longitudeE7: 370_450_000 } })
        : refuse(route, 'MAP_LINK_UNRECOGNIZED');
    }

    return refuse(route, 'NOT_FOUND');
  });

  return state;
}
