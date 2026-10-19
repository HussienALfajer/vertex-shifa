import { createFileRoute } from '@tanstack/react-router';
import { SignInScreen, type SignInSearch } from '../features/identity/sign-in-screen';

const purposes = new Set(['register', 'enroll', 'forgot', 'reenable']);

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    purpose: purposes.has(search.purpose as string)
      ? (search.purpose as SignInSearch['purpose'])
      : 'register',
    ...(search.first === true ? { first: true } : {}),
    ...(typeof search.member === 'string' ? { member: search.member } : {}),
  }),
  component: function SignInRoute() {
    const search = Route.useSearch();
    return <SignInScreen key={`${search.purpose}:${search.member ?? ''}`} search={search} />;
  },
});
