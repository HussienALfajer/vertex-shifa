import type { Practitioner, PractitionerProfileInput } from '@vertex-shifa/contracts';
import type { Transaction } from '@vertex-shifa/db';
import type { StaffActor } from '../../../core/access/actor.js';
import type { Membership } from './memberships.js';

// What staff management needs from the modules that own the data (spec S02): declared here,
// provided by those modules (identity, practitioners), as tenancy declares `FacilityDevices`.
// Every method runs in the caller's tenant transaction.

/** Accounts (platform, owned by identity). */
export interface StaffAccounts {
  /** The account of a phone, created without a password when it has none (rule 1). */
  findOrCreate(tx: Transaction, phone: string, actor: StaffActor): Promise<string>;
  /** Phones and the names people set, by account id. */
  profiles(
    tx: Transaction,
    accountIds: string[],
  ): Promise<Map<string, { phone: string; nameAr: string | null }>>;
  /** Rule 16: opens a password reset for the account until `until`, in the platform audit too. */
  authorizePasswordReset(
    tx: Transaction,
    accountId: string,
    actor: StaffActor,
    until: Date,
  ): Promise<void>;
}

export const STAFF_ACCOUNTS = Symbol('StaffAccounts');

/** A member's enrollments and sessions on the tenant's computers (owned by identity). */
export interface MemberDevices {
  /** Rule 8: revokes every enrollment of a deactivated member and ends their sessions. */
  cutOff(tx: Transaction, member: Membership, now: Date): Promise<void>;
  /** Rule 8: revokes the member's enrollments on computers now outside their scope. */
  cutOutsideScope(tx: Transaction, member: Membership, now: Date): Promise<void>;
}

export const MEMBER_DEVICES = Symbol('MemberDevices');

/** Doctor profiles (owned by the practitioners module, health layer). */
export interface PractitionerProfiles {
  /**
   * Rules 1 and 9, edge case 11: gives a member with the doctor role a current profile, restoring
   * an archived one (updated with `profile` when given) or creating one from `profile`. Without
   * either it refuses with `VALIDATION_FAILED`.
   */
  assign(
    tx: Transaction,
    membershipId: string,
    profile: PractitionerProfileInput | undefined,
    actor: StaffActor,
  ): Promise<void>;
  /** Rule 9: archives the member's current profile, if any. */
  archive(tx: Transaction, membershipId: string, actor: StaffActor): Promise<void>;
  /** The current profile ids of members, by membership id. */
  currentIds(tx: Transaction, membershipIds: string[]): Promise<Map<string, string>>;
  /** The member's current profile, or null. */
  current(tx: Transaction, membershipId: string): Promise<Practitioner | null>;
}

export const PRACTITIONER_PROFILES = Symbol('PractitionerProfiles');
