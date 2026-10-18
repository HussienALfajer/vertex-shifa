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
] as const;

export const auditActionSchema = z.enum(auditActions).meta({ id: 'AuditAction' });

export type AuditAction = z.infer<typeof auditActionSchema>;

/** Who did it: clinic staff, a patient, Vertex staff in the console, or the system (CLI, jobs). */
export const auditActorKindSchema = z
  .enum(['staff', 'patient', 'platform', 'system'])
  .meta({ id: 'AuditActorKind' });

export type AuditActorKind = z.infer<typeof auditActorKindSchema>;
