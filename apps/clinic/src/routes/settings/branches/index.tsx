import { createFileRoute } from '@tanstack/react-router';
import { BranchesScreen } from '../../../features/settings/branches-screen';

export const Route = createFileRoute('/settings/branches/')({
  validateSearch: (search: Record<string, unknown>): { archived?: boolean } =>
    search.archived === true ? { archived: true } : {},
  component: function BranchesRoute() {
    const { archived } = Route.useSearch();
    return <BranchesScreen archived={archived === true} />;
  },
});
