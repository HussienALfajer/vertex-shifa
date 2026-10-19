import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AppShell } from '../components/app-shell';
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
    <AppShell>
      <ErrorState onRetry={reset} />
    </AppShell>
  ),
  notFoundComponent: NotFoundState,
});
