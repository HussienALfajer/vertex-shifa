import { createFileRoute } from '@tanstack/react-router';
import { InviteScreen } from '../../../features/staff/invite-screen';

export const Route = createFileRoute('/settings/staff/new')({
  component: InviteScreen,
});
