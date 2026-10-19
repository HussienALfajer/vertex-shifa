import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AuthShell } from '../components/app-shell';
import { ErrorState } from '../components/error-state';
import { NotFoundState } from '../components/not-found-state';
import { IdentityGate } from '../features/identity/identity-gate';
import { useHistoryShortcuts } from '../lib/history-shortcuts';

function Root() {
  useHistoryShortcuts();
  return (
    <IdentityGate>
      <Outlet />
    </IdentityGate>
  );
}

export const Route = createRootRoute({
  component: Root,
  errorComponent: ({ reset }) => (
    <AuthShell>
      <ErrorState onRetry={reset} />
    </AuthShell>
  ),
  notFoundComponent: NotFoundState,
});
