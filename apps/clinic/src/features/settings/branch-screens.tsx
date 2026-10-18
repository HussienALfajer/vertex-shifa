import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import type { Facility } from '@vertex-shifa/contracts';
import { Button, EmptyState, PageHeader } from '@vertex-shifa/ui';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QueryStates } from '../../components/query-states';
import { useStaffAccess } from '../../lib/staff-access';
import { areaQuery, facilitiesQuery, facilityQuery } from '../tenancy/queries';
import { useTenant } from '../tenancy/tenant-gate';
import { FacilityForm } from './facility-form';

/** A saved branch's form once its city is known (the governorate picker needs the city's parent). */
function SavedFacilityForm({ facility, showName }: { facility: Facility; showName: boolean }) {
  const access = useStaffAccess();
  const city = useQuery(areaQuery(facility.areaId));
  return (
    <QueryStates queries={[city]}>
      {() => (
        <FacilityForm
          key={facility.id}
          facility={facility}
          governorateId={city.data?.parentId ?? undefined}
          showName={showName}
          allowed={access.manageFacility(facility.id)}
        />
      )}
    </QueryStates>
  );
}

/**
 * `/settings/location` (screen 5) for a single-branch clinic, which never sees the word "branch"
 * except in "Add a branch" (rule 9). With two branches or more, the branch list stands here.
 */
export function LocationSettingsScreen() {
  const { t } = useTranslation('clinic');
  const access = useStaffAccess();
  const tenant = useTenant();
  const inUse = useQuery(facilitiesQuery(false));
  const archived = useQuery(facilitiesQuery(true));
  return (
    <QueryStates queries={[inUse, archived]}>
      {() => {
        const branches = inUse.data?.items ?? [];
        if (branches.length >= 2) return <Navigate to="/settings/branches" replace />;
        const [branch] = branches;
        return (
          <section className="flex flex-col gap-6">
            <PageHeader
              title={t('settings.location.title')}
              description={t('settings.location.description')}
              actions={
                <>
                  {(archived.data?.total ?? 0) > 0 && (
                    <Button
                      variant="outline"
                      render={<Link to="/settings/branches" search={{ archived: true }} />}
                    >
                      {t('branches.showArchived')}
                    </Button>
                  )}
                  {access.manageTenant && tenant.status === 'active' && (
                    <Button variant="outline" render={<Link to="/settings/branches/new" />}>
                      <Plus aria-hidden />
                      {t('settings.addBranch')}
                    </Button>
                  )}
                </>
              }
            />
            {branch ? (
              <SavedFacilityForm facility={branch} showName={false} />
            ) : (
              <EmptyState title={t('settings.location.empty')} />
            )}
          </section>
        );
      }}
    </QueryStates>
  );
}

/** `/settings/branches/:id` (screen 5): one branch's settings, with its name. */
export function BranchSettingsScreen({ id }: { id: string }) {
  const { t } = useTranslation('clinic');
  const branch = useQuery(facilityQuery(id));
  return (
    <section className="flex flex-col gap-6">
      <QueryStates queries={[branch]}>
        {() => {
          const facility = branch.data as Facility;
          return (
            <>
              <PageHeader title={facility.name} description={t('branches.settingsDescription')} />
              <SavedFacilityForm facility={facility} showName />
            </>
          );
        }}
      </QueryStates>
    </section>
  );
}

/** `/settings/branches/new`: "Add a branch", then the branch list (screen 4). */
export function NewBranchScreen() {
  const { t } = useTranslation('clinic');
  const access = useStaffAccess();
  const navigate = useNavigate();
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t('branches.new.title')} description={t('branches.new.description')} />
      <FacilityForm
        showName
        allowed={access.manageTenant}
        onCreated={() => void navigate({ to: '/settings/branches' })}
      />
    </section>
  );
}
