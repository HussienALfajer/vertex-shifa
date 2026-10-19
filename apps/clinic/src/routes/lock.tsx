import { createFileRoute } from '@tanstack/react-router';
import { LockScreen, type LockSearch } from '../features/identity/lock-screen';

export const Route = createFileRoute('/lock')({
  validateSearch: (search: Record<string, unknown>): LockSearch =>
    typeof search.member === 'string' ? { member: search.member } : {},
  component: function LockRoute() {
    return <LockScreen search={Route.useSearch()} />;
  },
});
