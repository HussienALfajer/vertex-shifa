import { describe, expect, it } from 'vitest';
import { DomainError } from './errors.js';
import { defaultPractitionerNameAr, practitionerProfileInputSchema } from './practitioners.js';
import {
  assertMembershipAction,
  assertOwnerRemains,
  canApplyMembershipAction,
  canResendInvitation,
  changeStaffAccessSchema,
  createInvitationSchema,
  invitationSentAt,
  type MembershipAction,
  type MembershipStatus,
  membershipStatusSchema,
} from './staff.js';

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

const SPECIALTY = '01a1231c-0000-7101-8000-000000000001';
const BRANCH = '01a1231c-0000-7201-8000-000000000001';

const doctorProfile = {
  displayNameAr: 'د. طبيب تجريبي',
  gender: 'female',
  specialtyIds: [SPECIALTY],
};

describe('membership actions', () => {
  // The spec's state table: from → action.
  const allowed: [MembershipStatus, MembershipAction][] = [
    ['invited', 'accept'],
    ['invited', 'resend'],
    ['invited', 'cancel'],
    ['active', 'deactivate'],
    ['active', 'authorizePasswordReset'],
    ['deactivated', 'reactivate'],
  ];
  const actions: MembershipAction[] = [
    'accept',
    'resend',
    'cancel',
    'deactivate',
    'reactivate',
    'authorizePasswordReset',
  ];

  it('allows exactly the transitions of the spec', () => {
    for (const status of membershipStatusSchema.options) {
      for (const action of actions) {
        const expected = allowed.some(([s, a]) => s === status && a === action);
        expect(canApplyMembershipAction(status, action), `${status} ${action}`).toBe(expected);
      }
    }
  });

  it('refuses the rest with INVALID_STATUS_TRANSITION', () => {
    expect(refusal(() => assertMembershipAction('active', 'resend'))).toBe(
      'INVALID_STATUS_TRANSITION',
    );
    expect(refusal(() => assertMembershipAction('deactivated', 'deactivate'))).toBe(
      'INVALID_STATUS_TRANSITION',
    );
  });
});

describe('invitations', () => {
  const base = {
    phone: '0900 000 111',
    name: 'موظف تجريبي',
    roles: ['reception'],
    branchScope: { allFacilities: false, facilityIds: [BRANCH] },
  };

  it('normalizes the phone and defaults the adjustments', () => {
    expect(createInvitationSchema.parse(base)).toMatchObject({
      phone: '+963900000111',
      adjustments: { granted: [], revoked: [] },
    });
  });

  it('needs a mobile phone, a role and at least one branch', () => {
    expect(createInvitationSchema.safeParse({ ...base, phone: '021 2123456' }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ ...base, roles: [] }).success).toBe(false);
    expect(
      createInvitationSchema.safeParse({
        ...base,
        branchScope: { allFacilities: false, facilityIds: [] },
      }).success,
    ).toBe(false);
  });

  it('gives owners every branch', () => {
    expect(createInvitationSchema.safeParse({ ...base, roles: ['owner'] }).success).toBe(false);
    expect(
      createInvitationSchema.safeParse({
        ...base,
        roles: ['owner'],
        branchScope: { allFacilities: true },
      }).success,
    ).toBe(true);
  });

  it('needs a practitioner profile with the doctor role', () => {
    expect(createInvitationSchema.safeParse({ ...base, roles: ['doctor'] }).success).toBe(false);
    expect(
      createInvitationSchema.safeParse({ ...base, roles: ['doctor'], practitioner: doctorProfile })
        .success,
    ).toBe(true);
  });

  it('carries the updatedAt read for access changes', () => {
    const { phone: _, name: __, ...access } = base;
    expect(changeStaffAccessSchema.safeParse(access).success).toBe(false);
    expect(
      changeStaffAccessSchema.safeParse({ ...access, expectedUpdatedAt: '2026-10-18T10:00:00Z' })
        .success,
    ).toBe(true);
  });
});

describe('last owner', () => {
  it('refuses leaving no active owner', () => {
    expect(refusal(() => assertOwnerRemains(0))).toBe('LAST_OWNER');
    expect(() => assertOwnerRemains(1)).not.toThrow();
  });
});

describe('practitioner profiles', () => {
  it('need gender and 1–3 distinct specialties', () => {
    expect(practitionerProfileInputSchema.parse(doctorProfile)).toEqual({
      ...doctorProfile,
      displayNameLatin: null,
      syndicateNumber: null,
    });
    expect(
      practitionerProfileInputSchema.safeParse({ ...doctorProfile, gender: undefined }).success,
    ).toBe(false);
    expect(
      practitionerProfileInputSchema.safeParse({ ...doctorProfile, specialtyIds: [] }).success,
    ).toBe(false);
    expect(
      practitionerProfileInputSchema.safeParse({
        ...doctorProfile,
        specialtyIds: [SPECIALTY, SPECIALTY],
      }).success,
    ).toBe(false);
  });

  it('accept syndicate numbers of digits, letters, - and /', () => {
    expect(
      practitionerProfileInputSchema.safeParse({ ...doctorProfile, syndicateNumber: 'AL-1234/5' })
        .success,
    ).toBe(true);
    expect(
      practitionerProfileInputSchema.safeParse({ ...doctorProfile, syndicateNumber: '12 34' })
        .success,
    ).toBe(false);
  });

  it('prefill the professional name from the account name', () => {
    expect(defaultPractitionerNameAr(' طبيب تجريبي ')).toBe('د. طبيب تجريبي');
  });
});

describe('invitation resend', () => {
  it('finds when an invitation was sent from its 7-day expiry, and waits 10 minutes to resend', () => {
    const sentAt = new Date('2026-10-19T10:00:00.000Z');
    const expiresAt = new Date('2026-10-26T10:00:00.000Z');
    expect(invitationSentAt(expiresAt)).toEqual(sentAt);
    expect(canResendInvitation(sentAt, new Date('2026-10-19T10:09:59.999Z'))).toBe(false);
    expect(canResendInvitation(sentAt, new Date('2026-10-19T10:10:00.000Z'))).toBe(true);
  });
});
