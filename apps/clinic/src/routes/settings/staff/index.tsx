import { createFileRoute } from '@tanstack/react-router';
import { membershipStatusSchema } from '@vertex-shifa/contracts';
import { StaffScreen } from '../../../features/staff/staff-screen';

type StaffSearch = { status?: 'invited' | 'active' | 'deactivated'; page?: number };

export const Route = createFileRoute('/settings/staff/')({
  validateSearch: (search: Record<string, unknown>): StaffSearch => {
    const status = membershipStatusSchema.safeParse(search.status);
    const page = Number(search.page);
    return {
      ...(status.success ? { status: status.data } : {}),
      ...(Number.isInteger(page) && page > 1 ? { page } : {}),
    };
  },
  component: function StaffRoute() {
    const { status, page } = Route.useSearch();
    return <StaffScreen {...(status ? { status } : {})} page={page ?? 1} />;
  },
});
