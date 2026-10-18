import { createFileRoute } from '@tanstack/react-router';
import { BranchSettingsScreen } from '../../../features/settings/branch-screens';

export const Route = createFileRoute('/settings/branches/$id')({
  component: function BranchSettingsRoute() {
    const { id } = Route.useParams();
    return <BranchSettingsScreen key={id} id={id} />;
  },
});
