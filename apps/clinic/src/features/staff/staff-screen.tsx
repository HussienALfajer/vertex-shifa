import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { MembershipStatus, StaffMember } from '@vertex-shifa/contracts';
import { formatLocale } from '@vertex-shifa/i18n';
import {
  BackButton,
  Button,
  Callout,
  EmptyState,
  PageHeader,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from '@vertex-shifa/ui';
import { UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QueryStates } from '../../components/query-states';
import { meQuery, useStaffAccess } from '../../lib/staff-access';
import { useTenant } from '../tenancy/tenant-gate';
import { STAFF_PAGE_SIZE, staffQuery } from './queries';
import { MemberStatus, NoAccessState, useBranches, useRoleNames } from './staff-labels';

const filters = ['all', 'invited', 'active', 'deactivated'] as const;

/**
 * `/settings/staff` (screen 6), `staff.read`: the members with their roles, branches and status,
 * filtered by status; "Invite" for owners while the clinic is active (rule 3).
 */
export function StaffScreen({ status, page }: { status?: MembershipStatus; page: number }) {
  const { t } = useTranslation('clinic');
  const navigate = useNavigate();
  const access = useStaffAccess();
  const tenant = useTenant();
  const me = useQuery(meQuery);
  const staff = useQuery({ ...staffQuery(status, page), enabled: access.readStaff });
  const branches = useBranches();
  const roleNames = useRoleNames();

  if (me.data && !access.readStaff) return <NoAccessState />;

  const branchesOf = (member: StaffMember) =>
    member.branchScope.allFacilities
      ? t('staff.allBranches')
      : member.branchScope.facilityIds.map(branches.nameOf).join(t('roles.separator'));
  const numbers = new Intl.NumberFormat(formatLocale);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        back={<BackButton render={<Link to="/" />}>{t('nav.home')}</BackButton>}
        title={t('staff.title')}
        description={t('staff.description')}
        actions={
          access.manageStaff &&
          tenant.status === 'active' && (
            <Button render={<Link to="/settings/staff/new" />}>
              <UserPlus aria-hidden />
              {t('staff.invite')}
            </Button>
          )
        }
      />
      {me.data && !access.manageStaff && <Callout title={t('staff.readOnly')} />}
      <ToggleGroup
        aria-label={t('staff.filter')}
        className="flex-wrap"
        value={[status ?? 'all']}
        onValueChange={([next]) => {
          if (!next || next === (status ?? 'all')) return;
          void navigate({
            to: '/settings/staff',
            search: next === 'all' ? {} : { status: next as MembershipStatus },
          });
        }}
      >
        {filters.map((filter) => (
          <ToggleGroupItem key={filter} value={filter}>
            {t(`staff.filters.${filter}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <QueryStates queries={[staff, ...branches.queries]}>
        {() => {
          const list = staff.data;
          if (!list?.items.length) {
            return (
              <EmptyState
                title={t('staff.empty.title')}
                description={t('staff.empty.description')}
              />
            );
          }
          const from = (list.page - 1) * list.pageSize + 1;
          return (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('staff.columns.name')}</TableHead>
                    <TableHead>{t('staff.columns.roles')}</TableHead>
                    {branches.several && <TableHead>{t('staff.columns.branches')}</TableHead>}
                    <TableHead>{t('staff.columns.status')}</TableHead>
                    <TableHead>{t('staff.columns.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.items.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <span className="flex flex-col">
                          <span className="font-medium">
                            {member.name}
                            {member.id === me.data?.membershipId && (
                              <span className="text-muted-foreground"> ({t('staff.you')})</span>
                            )}
                          </span>
                          <bdi dir="ltr" className="self-start text-sm text-muted-foreground">
                            {member.phone}
                          </bdi>
                        </span>
                      </TableCell>
                      <TableCell>{roleNames(member.roles)}</TableCell>
                      {branches.several && <TableCell>{branchesOf(member)}</TableCell>}
                      <TableCell>
                        <MemberStatus member={member} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link to="/settings/staff/$id" params={{ id: member.id }} />}
                        >
                          {t('staff.open')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={list.page}
                pageCount={Math.ceil(list.total / STAFF_PAGE_SIZE)}
                onPageChange={(next) =>
                  void navigate({
                    to: '/settings/staff',
                    search: { ...(status ? { status } : {}), page: next },
                  })
                }
                summary={t('staff.pages.summary', {
                  from: numbers.format(from),
                  to: numbers.format(from + list.items.length - 1),
                  total: numbers.format(list.total),
                })}
                previousLabel={t('staff.pages.previous')}
                nextLabel={t('staff.pages.next')}
              />
            </>
          );
        }}
      </QueryStates>
    </section>
  );
}
