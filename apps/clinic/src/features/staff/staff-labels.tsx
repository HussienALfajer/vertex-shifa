import { useQuery } from '@tanstack/react-query';
import type { Role, StaffMember } from '@vertex-shifa/contracts';
import { Badge } from '@vertex-shifa/ui';
import { useTranslation } from 'react-i18next';
import { StateCard } from '../../components/state-card';
import { formatDateTime } from '../../lib/format';
import { facilitiesQuery } from '../tenancy/queries';

/** A member's roles in one line ("مالك، طبيب"). */
export function useRoleNames(): (roles: readonly Role[]) => string {
  const { t } = useTranslation('clinic');
  return (roles) => roles.map((role) => t(`roles.${role}`)).join(t('roles.separator'));
}

/**
 * The clinic's branches for the staff screens: those in use and the archived ones a member's scope
 * may still name (edge case 5). A clinic with one branch never sees the word "branch" (S01 rule 9).
 */
export function useBranches() {
  const inUse = useQuery(facilitiesQuery(false));
  const archived = useQuery(facilitiesQuery(true));
  const { t } = useTranslation('clinic');
  const names = new Map<string, string>();
  for (const branch of inUse.data?.items ?? []) names.set(branch.id, branch.name);
  for (const branch of archived.data?.items ?? []) {
    names.set(branch.id, t('staff.archivedBranch', { name: branch.name }));
  }
  return {
    queries: [inUse, archived] as const,
    inUse: inUse.data?.items ?? [],
    several: (inUse.data?.total ?? 0) >= 2,
    nameOf: (id: string) => names.get(id) ?? '',
  };
}

/** The status of a member: invited (with its expiry and message), active, deactivated, cancelled. */
export function MemberStatus({ member }: { member: StaffMember }) {
  const { t } = useTranslation('clinic');
  if (member.archivedAt) return <Badge tone="neutral">{t('staff.status.cancelled')}</Badge>;
  if (member.status !== 'invited') {
    return (
      <Badge tone={member.status === 'active' ? 'success' : 'neutral'}>
        {t(`staff.status.${member.status}`)}
      </Badge>
    );
  }
  const expiresAt = member.invitationExpiresAt;
  const expired = expiresAt !== null && Date.parse(expiresAt) <= Date.now();
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={expired ? 'warning' : 'info'}>{t('staff.status.invited')}</Badge>
      {expiresAt && (
        <span className="text-sm text-muted-foreground">
          {t(expired ? 'staff.invitationExpired' : 'staff.invitationExpires', {
            date: formatDateTime(expiresAt),
          })}
        </span>
      )}
      {member.invitationMessageStatus && (
        <span className="text-sm text-muted-foreground">
          {t(`staff.message.${member.invitationMessageStatus}`)}
        </span>
      )}
    </span>
  );
}

/** A screen the member's permissions do not open (cosmetic: the API refuses it anyway). */
export function NoAccessState() {
  const { t } = useTranslation('clinic');
  return (
    <StateCard role="alert" title={t('noAccess.title')} description={t('noAccess.description')} />
  );
}
