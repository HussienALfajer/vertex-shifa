import { createFileRoute } from '@tanstack/react-router';
import { MemberPractitionerScreen } from '../../../../features/staff/practitioner-screen';

export const Route = createFileRoute('/settings/staff/$id/profile')({
  component: function MemberPractitionerRoute() {
    const { id } = Route.useParams();
    return <MemberPractitionerScreen key={id} id={id} />;
  },
});
