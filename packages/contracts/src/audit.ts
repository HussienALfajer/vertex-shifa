import { z } from 'zod';

/**
 * Every action the audit log records (ADR 0016), as `<entity>.<verb>`. Entries hold ids and these
 * codes, never medical content; each spec adds its actions here and their labels in
 * `packages/i18n`.
 */
export const auditActions = [
  // S01 tenancy
  'tenant.created',
  'tenant.status_changed',
  'tenant.directory_listing_changed',
  'tenant.profile_updated',
  'tenant.onboarding_completed',
  'tenant_logo.replaced',
  'tenant_logo.archived',
  'facility.created',
  'facility.updated',
  'facility.archived',
  'facility.restored',
  // S02 identity, access and devices: in the tenant's audit
  'tenant.security_updated',
  'staff.invited',
  'staff.invitation_resent',
  'staff.invitation_cancelled',
  'staff.invitation_accepted',
  'staff.access_changed',
  'staff.deactivated',
  'staff.reactivated',
  'staff.password_reset_authorized',
  'device.registered',
  'device.renamed',
  'device.revoked',
  'device.wiped',
  'device_enrollment.created',
  'device_enrollment.revoked',
  'staff_session.started',
  'practitioner.updated',
  'practitioner_photo.replaced',
  'practitioner_photo.archived',
  // S02: account-level changes, in the platform audit (recovery also in each owner's tenant)
  'account.created',
  'account.password_set',
  'account.password_reset_authorized',
  'account.phone_changed',
  'account.sign_in_locked',
  // S02: the console, in the platform audit
  'console.request',
  'platform_user.created',
  'platform_user.role_changed',
  'platform_user.disabled',
  'platform_user.enabled',
  'platform_user.reset',
  'platform_user.setup_completed',
  'platform_user.signed_in',
  'platform_user.sign_in_failed',
  'platform_user.sign_in_locked',
  'platform_user.totp_failed',
  'platform_user.recovery_code_used',
  'platform_user.reauthenticated',
  'platform_user.password_changed',
  'platform_user.signed_out',
] as const;

export const auditActionSchema = z.enum(auditActions).meta({ id: 'AuditAction' });

export type AuditAction = z.infer<typeof auditActionSchema>;

/** Who did it: clinic staff, a patient, Vertex staff in the console, or the system (CLI, jobs). */
export const auditActorKindSchema = z
  .enum(['staff', 'patient', 'platform', 'system'])
  .meta({ id: 'AuditActorKind' });

export type AuditActorKind = z.infer<typeof auditActorKindSchema>;
