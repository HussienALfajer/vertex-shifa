import { createFileRoute } from '@tanstack/react-router';
import { AccountScreen } from '../../features/identity/account-screen';

export const Route = createFileRoute('/me/')({
  component: AccountScreen,
});
