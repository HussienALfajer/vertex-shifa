import { queryOptions, useQueryClient } from '@tanstack/react-query';
import type {
  Area,
  Coordinates,
  CreateFacility,
  Facility,
  FacilityPage,
  Tenant,
  TenantLogo,
  UpdateFacility,
  UpdateTenantProfile,
} from '@vertex-shifa/contracts';
import { ApiError, api, unwrap } from '../../lib/api';
import { fetchNow } from '../../lib/query-client';

// Server state of clinic setup (S01), online only: nothing here is queued while offline.

const readTenant = (): Promise<Tenant> => unwrap(api.GET('/api/tenant'));

export const tenantQuery = queryOptions({ queryKey: ['tenant'], queryFn: readTenant });

/** The clinic's logo, or `null` when it has none. */
export const logoQuery = queryOptions({
  queryKey: ['tenant', 'logo'],
  queryFn: async (): Promise<TenantLogo | null> => {
    try {
      return await unwrap(api.GET('/api/tenant/logo'));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') return null;
      throw error;
    }
  },
});

/** The branches in use (`archived: false`) or the archived ones; a tenant has a handful. */
function readFacilities(archived: boolean): Promise<FacilityPage> {
  return unwrap(
    api.GET('/api/facilities', {
      params: { query: { archived: archived ? 'true' : 'false', pageSize: 100 } },
    }),
  );
}

export function facilitiesQuery(archived: boolean) {
  return queryOptions({
    queryKey: ['facilities', { archived }],
    queryFn: () => readFacilities(archived),
  });
}

function readFacility(id: string): Promise<Facility> {
  return unwrap(api.GET('/api/facilities/{id}', { params: { path: { id } } }));
}

export function facilityQuery(id: string) {
  return queryOptions({ queryKey: ['facilities', 'one', id], queryFn: () => readFacility(id) });
}

/** Governorates without a parent, a governorate's cities with one; archived areas are left out. */
export function areasQuery(parentId: string | undefined) {
  return queryOptions({
    queryKey: ['areas', parentId ?? 'governorates'],
    queryFn: (): Promise<Area[]> =>
      unwrap(api.GET('/api/areas', { params: { query: parentId ? { parentId } : {} } })),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** One area, archived ones too: a branch keeps showing the city it references (edge case 4). */
function readArea(id: string): Promise<Area> {
  return unwrap(api.GET('/api/areas/{id}', { params: { path: { id } } }));
}

export function areaQuery(id: string) {
  return queryOptions({
    queryKey: ['areas', 'one', id],
    queryFn: () => readArea(id),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function updateProfile(input: UpdateTenantProfile): Promise<Tenant> {
  return unwrap(api.PATCH('/api/tenant/profile', { body: input }));
}

export function replaceLogo(file: File): Promise<TenantLogo> {
  return unwrap(
    api.PUT('/api/tenant/logo', {
      // The generated type names the multipart field; the browser sends the file itself.
      body: { file: '' },
      bodySerializer: () => {
        const form = new FormData();
        form.append('file', file);
        return form;
      },
    }),
  );
}

export function archiveLogo(): Promise<Tenant> {
  return unwrap(api.DELETE('/api/tenant/logo'));
}

export function completeOnboarding(): Promise<Tenant> {
  return unwrap(api.POST('/api/tenant/onboarding/complete'));
}

export function createFacility(input: CreateFacility): Promise<Facility> {
  return unwrap(api.POST('/api/facilities', { body: input }));
}

export function updateFacility(id: string, input: UpdateFacility): Promise<Facility> {
  return unwrap(api.PATCH('/api/facilities/{id}', { params: { path: { id } }, body: input }));
}

export function archiveFacility(id: string): Promise<Facility> {
  return unwrap(api.POST('/api/facilities/{id}/archive', { params: { path: { id } } }));
}

export function restoreFacility(id: string): Promise<Facility> {
  return unwrap(api.POST('/api/facilities/{id}/restore', { params: { path: { id } } }));
}

export function resolveMapLink(url: string): Promise<Coordinates> {
  return unwrap(api.POST('/api/maps/resolve-link', { body: { url } }));
}

/**
 * What a screen does after a write: the answer replaces the cached record, and a refusal because
 * the clinic was suspended or closed meanwhile reloads the tenant, so the read-only banner shows
 * (edge case 6).
 */
export function useSetupCache() {
  const queryClient = useQueryClient();
  return {
    tenantSaved: (tenant: Tenant) => queryClient.setQueryData(tenantQuery.queryKey, tenant),
    facilitySaved: (facility: Facility) => {
      queryClient.setQueryData(facilityQuery(facility.id).queryKey, facility);
      return queryClient.invalidateQueries({ queryKey: ['facilities'] });
    },
    logoChanged: () => queryClient.invalidateQueries({ queryKey: logoQuery.queryKey }),
    refused: (error: unknown) => {
      if (
        error instanceof ApiError &&
        (error.code === 'TENANT_SUSPENDED' || error.code === 'TENANT_CLOSED')
      ) {
        return queryClient.invalidateQueries({ queryKey: tenantQuery.queryKey, exact: true });
      }
    },
    /** The current record after a `CONFLICT` (rule 16) or a lost answer, read from the server now. */
    reloadTenant: () => fetchNow(queryClient, tenantQuery.queryKey, readTenant),
    reloadFacility: (id: string) =>
      fetchNow(queryClient, facilityQuery(id).queryKey, () => readFacility(id)),
    reloadFacilities: () =>
      fetchNow(queryClient, facilitiesQuery(false).queryKey, () => readFacilities(false)),
    reloadArea: (id: string) => fetchNow(queryClient, areaQuery(id).queryKey, () => readArea(id)),
  };
}
