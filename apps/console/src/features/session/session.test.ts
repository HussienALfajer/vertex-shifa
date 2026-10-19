import { QueryClient } from '@tanstack/react-query';
import type { ConsoleMe } from '@vertex-shifa/contracts';
import { describe, expect, it } from 'vitest';
import { forgetSession, holds, meQuery, needsReauth, signedIn } from './session';

const now = Date.parse('2026-10-19T09:00:00.000Z');

function me(reauthenticatedUntil: string | null): ConsoleMe {
  return {
    id: '0199f000-0000-7000-8000-000000000201',
    phone: '+963900000201',
    name: 'مدير تجريبي',
    role: 'support',
    permissions: ['tenants.read', 'accounts.recover'],
    recoveryCodesRemaining: 10,
    session: { expiresAt: '2026-10-19T21:00:00.000Z', reauthenticatedUntil },
  };
}

describe('needsReauth', () => {
  it('asks for a TOTP without a window, or with one about to close', () => {
    expect(needsReauth(undefined, now)).toBe(true);
    expect(needsReauth(me(null), now)).toBe(true);
    expect(needsReauth(me('2026-10-19T09:00:04.000Z'), now)).toBe(true);
    expect(needsReauth(me('2026-10-19T09:04:00.000Z'), now)).toBe(false);
  });
});

describe('holds', () => {
  it('reads the permissions the API gave', () => {
    expect(holds(me(null), 'accounts.recover')).toBe(true);
    expect(holds(me(null), 'platform-users.manage')).toBe(false);
    expect(holds(undefined, 'tenants.read')).toBe(false);
  });
});

describe('forgetSession', () => {
  it('drops the queries and the answers kept by mutations', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(meQuery.queryKey, me(null));
    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: async () => ({ setupCode: 'ABCD-EFGH-JKLM' }) })
      .execute(undefined);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(1);
    forgetSession(queryClient);
    expect(queryClient.getQueryData(meQuery.queryKey)).toBeUndefined();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });
});

describe('signedIn', () => {
  it('keeps the session view without the recovery codes, and drops what came before', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['console', 'platform-users'], []);
    signedIn(queryClient, { ...me(null), recoveryCodes: ['ABCD-EFGH'] });
    expect(queryClient.getQueryData(meQuery.queryKey)).toEqual(me(null));
    expect(queryClient.getQueryData(['console', 'platform-users'])).toBeUndefined();
  });
});
