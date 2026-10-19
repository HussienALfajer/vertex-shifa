import { createFileRoute } from '@tanstack/react-router';
import { DevicesScreen } from '../../features/devices/devices-screen';

export const Route = createFileRoute('/settings/devices')({
  validateSearch: (search: Record<string, unknown>): { revoked?: boolean } =>
    search.revoked === true ? { revoked: true } : {},
  component: function DevicesRoute() {
    const { revoked } = Route.useSearch();
    return <DevicesScreen revoked={revoked === true} />;
  },
});
