/**
 * Injection token of the `Database` connected as the audited platform-jobs role (ADR 0004): it
 * reads and claims `outbox_events` across tenants and adds jobs to pg-boss, nothing else. Every
 * statement it runs is in the server log, so it only carries ids, codes and timestamps.
 */
export const JOBS_DATABASE = Symbol('JobsDatabase');
