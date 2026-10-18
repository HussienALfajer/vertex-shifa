import type { Tenant } from '@vertex-shifa/contracts';
import { useOnline } from '../../lib/online';

/** A suspended or closed clinic keeps reading its data but changes nothing (rule 5, ADR 0013). */
export function isTenantWritable(tenant: Tenant): boolean {
  return tenant.status !== 'suspended' && tenant.status !== 'closed';
}

/**
 * Whether a setup form can save now: online (nothing is queued), the clinic writable, and the staff
 * member allowed (`allowed`, cosmetic: the API decides).
 */
export function useCanSave(tenant: Tenant, allowed: boolean): boolean {
  const online = useOnline();
  return online && allowed && isTenantWritable(tenant);
}
