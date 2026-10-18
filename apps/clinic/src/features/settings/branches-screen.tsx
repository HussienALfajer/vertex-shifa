import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { Facility } from '@vertex-shifa/contracts';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  BackButton,
  Badge,
  Button,
  Callout,
  EmptyState,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from '@vertex-shifa/ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { QueryStates } from '../../components/query-states';
import { useErrorText } from '../../lib/error-text';
import { useStaffAccess } from '../../lib/staff-access';
import {
  archiveFacility,
  areaQuery,
  facilitiesQuery,
  restoreFacility,
  useSetupCache,
} from '../tenancy/queries';
import { useCanSave } from '../tenancy/setup-access';
import { useTenant } from '../tenancy/tenant-gate';

/**
 * `/settings/branches` (screen 4): the branches with their city and status; add, archive (never
 * the last one in use, rule 7) and restore (rule 8). Archived branches sit behind the filter.
 */
export function BranchesScreen({ archived }: { archived: boolean }) {
  const { t } = useTranslation('clinic');
  const navigate = useNavigate();
  const access = useStaffAccess();
  const tenant = useTenant();
  const branches = useQuery(facilitiesQuery(archived));
  const [error, setError] = useState<string>();
  const view = archived ? 'archived' : 'inUse';

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        back={<BackButton render={<Link to="/" />}>{t('nav.home')}</BackButton>}
        title={t('branches.title')}
        description={t('branches.description')}
        actions={
          access.manageTenant &&
          tenant.status === 'active' && (
            <Button render={<Link to="/settings/branches/new" />}>
              <Plus aria-hidden />
              {t('settings.addBranch')}
            </Button>
          )
        }
      />
      <OfflineNotice />
      {error && <Callout role="alert" tone="danger" title={error} />}
      <ToggleGroup
        aria-label={t('branches.filter')}
        value={[view]}
        onValueChange={([next]) => {
          if (!next || next === view) return;
          setError(undefined);
          void navigate({ to: '/settings/branches', search: { archived: next === 'archived' } });
        }}
      >
        <ToggleGroupItem value="inUse">{t('branches.inUse')}</ToggleGroupItem>
        <ToggleGroupItem value="archived">{t('branches.archived')}</ToggleGroupItem>
      </ToggleGroup>
      <QueryStates queries={[branches]}>
        {() =>
          branches.data?.items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('branches.columns.name')}</TableHead>
                  <TableHead>{t('branches.columns.area')}</TableHead>
                  <TableHead>{t('branches.columns.status')}</TableHead>
                  <TableHead>{t('branches.columns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.data.items.map((branch) => (
                  <BranchRow key={branch.id} branch={branch} onError={setError} />
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={archived ? t('branches.emptyArchived.title') : t('settings.location.empty')}
              description={archived ? t('branches.emptyArchived.description') : undefined}
            />
          )
        }
      </QueryStates>
    </section>
  );
}

function BranchRow({
  branch,
  onError,
}: {
  branch: Facility;
  onError: (text: string | undefined) => void;
}) {
  const { t } = useTranslation('clinic');
  const access = useStaffAccess();
  const tenant = useTenant();
  const errorText = useErrorText();
  const cache = useSetupCache();
  const canSave = useCanSave(tenant, access.manageTenant);
  const city = useQuery(areaQuery(branch.areaId));
  const archived = branch.archivedAt !== null;
  const change = useMutation({
    mutationFn: () => (archived ? restoreFacility(branch.id) : archiveFacility(branch.id)),
    onMutate: () => onError(undefined),
    onSuccess: (saved) => cache.facilitySaved(saved),
    onError: (error) => {
      onError(errorText(error));
      void cache.refused(error);
    },
  });

  return (
    <TableRow>
      <TableCell className="font-medium">{branch.name}</TableCell>
      <TableCell>{city.data?.nameAr}</TableCell>
      <TableCell>
        <Badge tone={archived ? 'neutral' : 'success'}>
          {archived ? t('branches.status.archived') : t('branches.status.active')}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          {!archived && (
            <Button
              variant="outline"
              size="sm"
              render={<Link to="/settings/branches/$id" params={{ id: branch.id }} />}
            >
              {t('branches.open')}
            </Button>
          )}
          {access.manageTenant &&
            (archived ? (
              <Button
                variant="outline"
                size="sm"
                disabled={!canSave || change.isPending}
                onClick={() => change.mutate()}
              >
                {t('branches.restore')}
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="ghost" size="sm" disabled={!canSave || change.isPending} />
                  }
                >
                  {t('branches.archive')}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('branches.archiveConfirm.title', { name: branch.name })}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('branches.archiveConfirm.description')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogClose render={<Button variant="outline" />}>
                      {t('branches.archiveConfirm.cancel')}
                    </AlertDialogClose>
                    <AlertDialogClose
                      render={<Button variant="destructive" />}
                      onClick={() => change.mutate()}
                    >
                      {t('branches.archiveConfirm.confirm')}
                    </AlertDialogClose>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ))}
        </div>
      </TableCell>
    </TableRow>
  );
}
