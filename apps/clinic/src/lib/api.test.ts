import { afterEach, describe, expect, it, vi } from 'vitest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

/** Whether the promise settled within a few ticks. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  const pending = new Promise<false>((resolve) => setTimeout(() => resolve(false), 20));
  const done = promise.then(
    () => true,
    () => true,
  );
  return Promise.race([done, pending]);
}

/** The API client on a stand-in `fetch` whose answers the test releases. */
async function clientWith(answer: Promise<Response>) {
  const sent: Request[] = [];
  vi.stubEnv('VITE_API_URL', 'http://api.test');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: Request) => {
      sent.push(request);
      return answer;
    }),
  );
  vi.resetModules();
  const { api, identityApi } = await import('./api');
  const scope = await import('./identity-scope');
  return { api, identityApi, scope, sent };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

describe('api client across identities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('cancels a member’s request when another identity comes, and never answers it', async () => {
    const answer = deferred<Response>();
    const { api, scope, sent } = await clientWith(answer.promise);
    scope.enterIdentity(scope.memberKey({ deviceId: 'device-a', enrollmentId: 'owner-a' }));
    const reading = api.GET('/api/tenant');
    await vi.waitFor(() => expect(sent).toHaveLength(1));

    scope.enterIdentity(null);
    scope.enterIdentity(scope.memberKey({ deviceId: 'device-b', enrollmentId: 'member-b' }));
    expect(sent[0]?.signal.aborted).toBe(true);
    answer.resolve(json({ nameAr: 'clinic A' }));
    expect(await settled(reading)).toBe(false);
  });

  it('answers a member’s request while they stay unlocked', async () => {
    const { api, scope } = await clientWith(Promise.resolve(json({ nameAr: 'clinic A' })));
    scope.enterIdentity(scope.memberKey({ deviceId: 'device-a', enrollmentId: 'owner-a' }));
    const { data } = await api.GET('/api/tenant');
    expect(data).toEqual({ nameAr: 'clinic A' });
  });

  it('keeps the access token a request was made with, whoever is unlocked when it is sent', async () => {
    const { identityApi, sent } = await clientWith(Promise.resolve(json({ data: 'logo' })));
    const { authorizeRequests } = await import('./api');
    authorizeRequests({
      accessToken: async () => ({ token: 'next-member', owner: 'member-b' }),
      refused: vi.fn(),
    });
    await identityApi.GET('/api/tenant/logo', { headers: { authorization: 'Bearer owner-a' } });
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer owner-a');
  });

  it('hands a refusal of the session to the member the request was authorized for', async () => {
    const refusal = new Response(JSON.stringify({ code: 'SESSION_ENDED', message: 'ended' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
    const { api, scope } = await clientWith(Promise.resolve(refusal));
    const { authorizeRequests } = await import('./api');
    const refused = vi.fn();
    authorizeRequests({ accessToken: async () => ({ token: 'a', owner: 'owner-a' }), refused });
    scope.enterIdentity(scope.memberKey({ deviceId: 'device-a', enrollmentId: 'owner-a' }));
    await api.GET('/api/tenant');
    expect(refused).toHaveBeenCalledWith('SESSION_ENDED', 'owner-a');
  });

  it('answers the identity’s own requests whoever is unlocked by then', async () => {
    const answer = deferred<Response>();
    const { identityApi, scope } = await clientWith(answer.promise);
    scope.enterIdentity(scope.memberKey({ deviceId: 'device-a', enrollmentId: 'owner-a' }));
    const refreshing = identityApi.GET('/api/devices/current', {
      headers: { 'x-device-token': 'token' },
    });
    scope.enterIdentity(null);
    answer.resolve(json({ deviceId: 'device-a' }));
    expect(await settled(refreshing)).toBe(true);
  });
});
