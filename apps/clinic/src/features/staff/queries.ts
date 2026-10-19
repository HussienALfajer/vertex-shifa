import { queryOptions, useQueryClient } from '@tanstack/react-query';
import {
  type AccessCatalog,
  accessCatalogSchema,
  type ChangeStaffAccess,
  type CreateInvitation,
  type MembershipStatus,
  type Practitioner,
  type PractitionerPhoto,
  type PractitionerProfileInput,
  type PreviousPractitioner,
  type Specialty,
  type StaffMember,
  type StaffPage,
  type UpdatePractitioner,
} from '@vertex-shifa/contracts';
import { ApiError, api, unwrap } from '../../lib/api';
import { fetchNow } from '../../lib/query-client';
import { meQuery } from '../../lib/staff-access';

// Server state of staff and doctor profiles (S02), online only: nothing here is queued offline.

/** A clinic has a handful of staff: one page of the largest size the API serves. */
export const STAFF_PAGE_SIZE = 100;

function readStaff(status: MembershipStatus | undefined, page: number): Promise<StaffPage> {
  return unwrap(
    api.GET('/api/staff', {
      params: { query: { ...(status ? { status } : {}), page, pageSize: STAFF_PAGE_SIZE } },
    }),
  );
}

export function staffQuery(status: MembershipStatus | undefined, page: number) {
  return queryOptions({
    queryKey: ['staff', 'list', { status, page }],
    queryFn: () => readStaff(status, page),
  });
}

function readMember(id: string): Promise<StaffMember> {
  return unwrap(api.GET('/api/staff/{id}', { params: { path: { id } } }));
}

export function memberQuery(id: string) {
  return queryOptions({ queryKey: ['staff', 'one', id], queryFn: () => readMember(id) });
}

function readPreviousPractitioner(id: string): Promise<PreviousPractitioner> {
  return unwrap(api.GET('/api/staff/{id}/previous-practitioner', { params: { path: { id } } }));
}

/** The doctor profile the doctor role brings back, for the owner (`staff.manage`, rule 9). */
export function previousPractitionerQuery(id: string) {
  return queryOptions({
    queryKey: ['staff', 'one', id, 'previous-practitioner'],
    queryFn: () => readPreviousPractitioner(id),
  });
}

/** The permission catalog, presets and limits the API applies (screen 7). */
export const catalogQuery = queryOptions({
  queryKey: ['access', 'catalog'],
  // Parsed: the API's types name the presets as a plain record.
  queryFn: async (): Promise<AccessCatalog> =>
    accessCatalogSchema.parse(await unwrap(api.GET('/api/access/catalog'))),
  staleTime: Number.POSITIVE_INFINITY,
});

export const specialtiesQuery = queryOptions({
  queryKey: ['specialties'],
  queryFn: (): Promise<Specialty[]> => unwrap(api.GET('/api/specialties')),
  staleTime: Number.POSITIVE_INFINITY,
});

function readPractitioner(id: string): Promise<Practitioner> {
  return unwrap(api.GET('/api/practitioners/{id}', { params: { path: { id } } }));
}

export function practitionerQuery(id: string) {
  return queryOptions({
    queryKey: ['practitioners', id],
    queryFn: () => readPractitioner(id),
  });
}

/** The doctor's photo, or `null` without one. */
export function practitionerPhotoQuery(id: string) {
  return queryOptions({
    queryKey: ['practitioners', id, 'photo'],
    queryFn: async (): Promise<PractitionerPhoto | null> => {
      try {
        return await unwrap(api.GET('/api/practitioners/{id}/photo', { params: { path: { id } } }));
      } catch (error) {
        if (error instanceof ApiError && error.code === 'NOT_FOUND') return null;
        throw error;
      }
    },
  });
}

const member = (id: string) => ({ params: { path: { id } } });

/** The doctor profile goes with the doctor role only: absent otherwise, never `undefined`. */
type WithProfile<T> = Omit<T, 'practitioner'> & { practitioner?: PractitionerProfileInput };

export function invite(input: WithProfile<CreateInvitation>): Promise<StaffMember> {
  return unwrap(api.POST('/api/staff/invitations', { body: input }));
}

export function resendInvitation(id: string): Promise<StaffMember> {
  return unwrap(api.POST('/api/staff/{id}/invitation/resend', member(id)));
}

export function cancelInvitation(id: string): Promise<StaffMember> {
  return unwrap(api.POST('/api/staff/{id}/invitation/cancel', member(id)));
}

export function changeAccess(
  id: string,
  input: WithProfile<ChangeStaffAccess>,
): Promise<StaffMember> {
  return unwrap(api.PATCH('/api/staff/{id}/access', { ...member(id), body: input }));
}

export function deactivateMember(id: string, reason: string): Promise<StaffMember> {
  return unwrap(api.POST('/api/staff/{id}/deactivate', { ...member(id), body: { reason } }));
}

export function reactivateMember(id: string): Promise<StaffMember> {
  return unwrap(api.POST('/api/staff/{id}/reactivate', member(id)));
}

export function authorizePasswordReset(id: string) {
  return unwrap(api.POST('/api/staff/{id}/password-reset', member(id)));
}

export function updatePractitioner(id: string, input: UpdatePractitioner): Promise<Practitioner> {
  return unwrap(api.PATCH('/api/practitioners/{id}', { ...member(id), body: input }));
}

export function replacePhoto(id: string, file: File): Promise<PractitionerPhoto> {
  return unwrap(
    api.PUT('/api/practitioners/{id}/photo', {
      ...member(id),
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

export function removePhoto(id: string): Promise<Practitioner> {
  return unwrap(api.DELETE('/api/practitioners/{id}/photo', member(id)));
}

/** What a screen does after a staff or profile write, and the reads of a save. */
export function useStaffCache() {
  const queryClient = useQueryClient();
  const listsChanged = () => queryClient.invalidateQueries({ queryKey: ['staff', 'list'] });
  return {
    memberSaved: (saved: StaffMember) => {
      queryClient.setQueryData(memberQuery(saved.id).queryKey, saved);
      // The doctor role may have archived or restored a profile.
      void queryClient.invalidateQueries({
        queryKey: previousPractitionerQuery(saved.id).queryKey,
      });
      // The member's doctor profile may have come or gone with the doctor role.
      void queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      // The owner may have changed their own access.
      void queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
      return listsChanged();
    },
    listsChanged,
    practitionerSaved: (saved: Practitioner) => {
      queryClient.setQueryData(practitionerQuery(saved.id).queryKey, saved);
      return queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
    },
    /** The photo as the server re-encoded it; the profile's `hasPhoto` follows. */
    photoChanged: (id: string, photo: PractitionerPhoto | null) => {
      queryClient.setQueryData(practitionerPhotoQuery(id).queryKey, photo);
      return queryClient.invalidateQueries({
        queryKey: practitionerQuery(id).queryKey,
        exact: true,
      });
    },
    /** The current record after a `CONFLICT` (rule 10), read from the server now. */
    reloadMember: (id: string) =>
      fetchNow(queryClient, memberQuery(id).queryKey, () => readMember(id)),
    /** After a save, the profile the doctor role would now bring back. */
    reloadPreviousPractitioner: (id: string) =>
      fetchNow(queryClient, previousPractitionerQuery(id).queryKey, () =>
        readPreviousPractitioner(id),
      ),
    reloadPractitioner: (id: string) =>
      fetchNow(queryClient, practitionerQuery(id).queryKey, () => readPractitioner(id)),
    /** Every member, to find the one an `ALREADY_MEMBER` refusal means. */
    reloadStaff: () =>
      fetchNow(queryClient, staffQuery(undefined, 1).queryKey, () => readStaff(undefined, 1)),
  };
}
