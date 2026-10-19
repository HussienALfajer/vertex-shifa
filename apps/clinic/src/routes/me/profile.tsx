import { createFileRoute } from '@tanstack/react-router';
import { OwnPractitionerScreen } from '../../features/staff/practitioner-screen';

export const Route = createFileRoute('/me/profile')({
  component: OwnPractitionerScreen,
});
