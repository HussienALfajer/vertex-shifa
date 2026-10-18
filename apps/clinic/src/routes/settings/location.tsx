import { createFileRoute } from '@tanstack/react-router';
import { LocationSettingsScreen } from '../../features/settings/branch-screens';

export const Route = createFileRoute('/settings/location')({
  component: LocationSettingsScreen,
});
