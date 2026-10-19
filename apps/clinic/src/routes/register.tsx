import { createFileRoute } from '@tanstack/react-router';
import { RegisterScreen } from '../features/identity/register-screen';

export const Route = createFileRoute('/register')({
  component: RegisterScreen,
});
