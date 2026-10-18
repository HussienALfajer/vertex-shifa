import { createFileRoute } from '@tanstack/react-router';
import { NewBranchScreen } from '../../../features/settings/branch-screens';

export const Route = createFileRoute('/settings/branches/new')({
  component: NewBranchScreen,
});
