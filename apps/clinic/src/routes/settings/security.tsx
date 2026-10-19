import { createFileRoute } from '@tanstack/react-router';
import { SecurityScreen } from '../../features/settings/security-screen';

export const Route = createFileRoute('/settings/security')({
  component: SecurityScreen,
});
