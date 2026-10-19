import { createFileRoute } from '@tanstack/react-router';
import { NewPinScreen } from '../../features/identity/new-pin-screen';

export const Route = createFileRoute('/pin/new')({
  component: NewPinScreen,
});
