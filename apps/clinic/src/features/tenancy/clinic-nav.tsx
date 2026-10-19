import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { SidebarGroup, SidebarLink, SidebarNav } from '@vertex-shifa/ui';
import {
  ClipboardListIcon,
  HospitalIcon,
  HouseIcon,
  MapPinIcon,
  MonitorIcon,
  NetworkIcon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStaffAccess } from '../../lib/staff-access';
import { facilitiesQuery, tenantQuery } from './queries';

/**
 * The clinic's screens, in the sidebar. While the clinic is onboarding only its setup is open
 * (rule 4). A single-branch clinic never sees the word "branch" (rule 9): its location screen
 * stands where the branch list would. Staff, devices and security show to the members whose
 * permissions open them (cosmetic: the API decides).
 */
export function ClinicNav() {
  const { t } = useTranslation('clinic');
  const tenant = useQuery(tenantQuery);
  const access = useStaffAccess();
  const branches = useQuery({
    ...facilitiesQuery(false),
    enabled: tenant.data !== undefined && tenant.data.status !== 'onboarding',
  });
  if (!tenant.data) return <SidebarNav aria-label={t('nav.label')} />;
  if (tenant.data.status === 'onboarding') {
    return (
      <SidebarNav aria-label={t('nav.label')}>
        <SidebarLink render={<Link to="/setup" />}>
          <ClipboardListIcon aria-hidden />
          {t('nav.setup')}
        </SidebarLink>
      </SidebarNav>
    );
  }
  const several = (branches.data?.total ?? 0) >= 2;
  return (
    <SidebarNav aria-label={t('nav.label')}>
      <SidebarLink render={<Link to="/" activeOptions={{ exact: true }} />}>
        <HouseIcon aria-hidden />
        {t('nav.home')}
      </SidebarLink>
      <SidebarGroup label={t('nav.settings')}>
        <SidebarLink render={<Link to="/settings/clinic" />}>
          <HospitalIcon aria-hidden />
          {t('nav.clinic')}
        </SidebarLink>
        {branches.data &&
          (several ? (
            <SidebarLink render={<Link to="/settings/branches" />}>
              <NetworkIcon aria-hidden />
              {t('nav.branches')}
            </SidebarLink>
          ) : (
            <SidebarLink render={<Link to="/settings/location" />}>
              <MapPinIcon aria-hidden />
              {t('nav.location')}
            </SidebarLink>
          ))}
        {access.readStaff && (
          <SidebarLink render={<Link to="/settings/staff" />}>
            <UsersIcon aria-hidden />
            {t('nav.staff')}
          </SidebarLink>
        )}
        {access.manageDevices && (
          <SidebarLink render={<Link to="/settings/devices" />}>
            <MonitorIcon aria-hidden />
            {t('nav.devices')}
          </SidebarLink>
        )}
        {access.manageTenant && (
          <SidebarLink render={<Link to="/settings/security" />}>
            <ShieldCheckIcon aria-hidden />
            {t('nav.security')}
          </SidebarLink>
        )}
      </SidebarGroup>
    </SidebarNav>
  );
}
