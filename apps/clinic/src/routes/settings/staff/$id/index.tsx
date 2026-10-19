import { createFileRoute } from '@tanstack/react-router';
import { MemberScreen } from '../../../../features/staff/member-screen';

export const Route = createFileRoute('/settings/staff/$id/')({
  component: function MemberRoute() {
    const { id } = Route.useParams();
    return <MemberScreen key={id} id={id} />;
  },
});
