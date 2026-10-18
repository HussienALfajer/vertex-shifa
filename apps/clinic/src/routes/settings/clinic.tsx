import { createFileRoute } from '@tanstack/react-router';
import { ClinicSettingsScreen } from '../../features/settings/clinic-settings-screen';

export const Route = createFileRoute('/settings/clinic')({
  component: ClinicSettingsScreen,
});
