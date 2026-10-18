import { useQuery } from '@tanstack/react-query';
import type { Facility } from '@vertex-shifa/contracts';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryStates } from '../../components/query-states';
import { StateCard } from '../../components/state-card';
import { useStaffAccess } from '../../lib/staff-access';
import { areaQuery, facilitiesQuery } from '../tenancy/queries';
import { useTenant } from '../tenancy/tenant-gate';
import { type SetupStep, SetupWizard } from './setup-wizard';

/**
 * `/setup` while the clinic is onboarding (rule 4): the wizard for the owner, "setup in progress"
 * for any other staff member (screens 1 and 2).
 */
export function SetupScreen() {
  const access = useStaffAccess();
  return access.manageTenant ? <SetupLoader /> : <SetupInProgress />;
}

/** Sign-out arrives with sessions (S02). */
function SetupInProgress() {
  const { t } = useTranslation('clinic');
  return (
    <StateCard
      role="status"
      title={t('setup.inProgress.title')}
      description={t('setup.inProgress.description')}
    />
  );
}

/** The wizard starts from what is saved: the first branch in use and its city, if any. */
function SetupLoader() {
  const tenant = useTenant();
  const branches = useQuery(facilitiesQuery(false));
  // The branch as first loaded: one the wizard creates later must not reload (and so reset) it.
  const first = useRef<{ branch: Facility | undefined }>(undefined);
  if (!first.current && branches.data) first.current = { branch: branches.data.items[0] };
  const branch = first.current?.branch;
  const city = useQuery({ ...areaQuery(branch?.areaId ?? ''), enabled: !!branch });
  return (
    <QueryStates queries={branch ? [branches, city] : [branches]}>
      {() => (
        <SetupWizard
          tenant={tenant}
          branch={branch}
          governorateId={city.data?.parentId ?? undefined}
          initialStep={resumeStep(branch)}
        />
      )}
    </QueryStates>
  );
}

/**
 * Where the owner resumes on any device (rule 3): from the clinic step until the branch exists,
 * then at the week step, where the currency is chosen again: the saved one may be the stand-in the
 * location step sent, and nothing on the server tells them apart.
 */
function resumeStep(branch: Facility | undefined): SetupStep {
  return branch ? 'week' : 'clinic';
}
