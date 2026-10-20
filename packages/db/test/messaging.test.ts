import { eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  accounts,
  type Database,
  otpChallenges,
  whatsappKnownRecipients,
  whatsappMessages,
  whatsappOptOuts,
  whatsappSessionCredentials,
  whatsappSessionEvents,
  whatsappSessions,
} from '../src/index.js';
import { connect, refusal } from './connections.js';

// Synthetic numbers in the unassigned country code +999 and synthetic hashes only (S03).

const { owner, app } = connect();

let labelSeq = 0;
const label = () => `رقم ${++labelSeq}`;
const minute = 60_000;

async function createSession(values: Partial<typeof whatsappSessions.$inferInsert> = {}) {
  const [session] = await app
    .insert(whatsappSessions)
    .values({ kind: 'platform', label: label(), state: 'linking', ...values })
    .returning();
  if (!session) throw new Error('no session created');
  return session;
}

const queued = (values: Partial<typeof whatsappMessages.$inferInsert> = {}) => ({
  kind: 'alert',
  pool: 'platform',
  recipientHash: 'synthetic-recipient-hash',
  recipientSealed: 'v1.synthetic',
  bodySealed: 'v1.synthetic',
  status: 'queued',
  deadlineAt: new Date(Date.now() + 60 * minute),
  nextAttemptAt: new Date(),
  ...values,
});

describe('whatsapp_sessions', () => {
  it('keeps labels and phones unique among unarchived sessions only', async () => {
    const first = await createSession({ phone: '+999100000001', state: 'connected' });
    expect(await refusal(createSession({ label: first.label }))).toMatch(
      /whatsapp_sessions_label_idx/,
    );
    expect(await refusal(createSession({ phone: '+999100000001' }))).toMatch(
      /whatsapp_sessions_phone_idx/,
    );
    await app
      .update(whatsappSessions)
      .set({ state: 'unlinked', archivedAt: new Date() })
      .where(eq(whatsappSessions.id, first.id));
    await createSession({ label: first.label, phone: '+999100000001' });
  });

  it('refuses unknown states, a pause without its reason, a half lease and a live unlinked row', async () => {
    expect(await refusal(createSession({ state: 'paused' }))).toMatch(/whatsapp_sessions_state/);
    expect(await refusal(createSession({ pausedAt: new Date() }))).toMatch(
      /whatsapp_sessions_pause/,
    );
    expect(await refusal(createSession({ pausedAt: new Date(), pauseReason: 'tired' }))).toMatch(
      /whatsapp_sessions_pause/,
    );
    await createSession({ pausedAt: new Date(), pauseReason: 'send_failures' });
    expect(await refusal(createSession({ leaseHolder: uuidv7() }))).toMatch(
      /whatsapp_sessions_lease/,
    );
    expect(await refusal(createSession({ state: 'unlinked' }))).toMatch(
      /whatsapp_sessions_unlinked_archived/,
    );
    expect(await refusal(createSession({ label: 'ر' }))).toMatch(/whatsapp_sessions_label/);
  });

  it('is archived, never deleted, by the app role', async () => {
    const session = await createSession();
    expect(
      await refusal(app.delete(whatsappSessions).where(eq(whatsappSessions.id, session.id))),
    ).toMatch(/permission denied/);
  });
});

describe('whatsapp_session_credentials and whatsapp_known_recipients', () => {
  it('hold one value per key and one row per recipient, deleted with the session', async () => {
    const session = await createSession();
    const credential = {
      sessionId: session.id,
      keyHash: 'synthetic-key-hash',
      valueSealed: 'v1.synthetic',
    };
    await app.insert(whatsappSessionCredentials).values(credential);
    expect(await refusal(app.insert(whatsappSessionCredentials).values(credential))).toMatch(
      /whatsapp_session_credentials_session_key_hash_unique/,
    );
    const known = {
      sessionId: session.id,
      recipientHash: 'synthetic-recipient-hash',
      firstSentAt: new Date(),
      lastSentAt: new Date(),
    };
    await app.insert(whatsappKnownRecipients).values(known);
    expect(await refusal(app.insert(whatsappKnownRecipients).values(known))).toMatch(
      /whatsapp_known_recipients_session_recipient_unique/,
    );
    await app
      .delete(whatsappSessionCredentials)
      .where(eq(whatsappSessionCredentials.sessionId, session.id));
    await app
      .delete(whatsappKnownRecipients)
      .where(eq(whatsappKnownRecipients.sessionId, session.id));
  });
});

describe('whatsapp_session_events', () => {
  let eventId: string;

  beforeAll(async () => {
    const session = await createSession();
    const [event] = await app
      .insert(whatsappSessionEvents)
      .values({ sessionId: session.id, type: 'created' })
      .returning();
    if (!event) throw new Error('no event');
    eventId = event.id;
  });

  const update = (db: Database) =>
    db
      .update(whatsappSessionEvents)
      .set({ reason: 'changed' })
      .where(eq(whatsappSessionEvents.id, eventId));
  const remove = (db: Database) =>
    db.delete(whatsappSessionEvents).where(eq(whatsappSessionEvents.id, eventId));

  it('refuses an unknown type', async () => {
    const [session] = await app.select().from(whatsappSessions).limit(1);
    expect(
      await refusal(
        app.insert(whatsappSessionEvents).values({ sessionId: session?.id ?? '', type: 'hacked' }),
      ),
    ).toMatch(/whatsapp_session_events_type/);
  });

  it('keeps reason codes, never a free-text message, in events and sessions', async () => {
    const session = await createSession();
    const event = (reason: string) =>
      app.insert(whatsappSessionEvents).values({ sessionId: session.id, type: 'paused', reason });
    await event('send_failures');
    // Every alert of rule 28 keeps its own event, for its own 30-minute throttle.
    for (const reason of [
      'needs_relink',
      'banned',
      'disconnected',
      'send_failures',
      'none_healthy',
      'recovered',
    ]) {
      await app
        .insert(whatsappSessionEvents)
        .values({ sessionId: session.id, type: 'alert_sent', reason });
    }
    expect(await refusal(event('Connection Failure for +999100000009'))).toMatch(
      /whatsapp_session_events_reason/,
    );
    expect(await refusal(createSession({ lastDisconnectReason: 'stream errored out' }))).toMatch(
      /whatsapp_sessions_last_disconnect_reason/,
    );
    await createSession({ lastDisconnectReason: 'connection_lost' });
  });

  it('is append-only for the app role and, through the trigger, for the owner', async () => {
    expect(await refusal(update(app))).toMatch(/permission denied/);
    expect(await refusal(remove(app))).toMatch(/permission denied/);
    expect(await refusal(update(owner))).toBe(
      'whatsapp_session_events is append-only: UPDATE refused',
    );
    expect(await refusal(remove(owner))).toBe(
      'whatsapp_session_events is append-only: DELETE refused',
    );
    expect(await refusal(owner.execute(sql`truncate whatsapp_session_events`))).toBe(
      'whatsapp_session_events is append-only: TRUNCATE refused',
    );
  });
});

describe('whatsapp_messages', () => {
  it('needs a challenge for an OTP, a subject for an invitation and the number for a reply', async () => {
    expect(await refusal(app.insert(whatsappMessages).values(queued({ kind: 'otp' })))).toMatch(
      /whatsapp_messages_otp_challenge/,
    );
    expect(
      await refusal(app.insert(whatsappMessages).values(queued({ kind: 'invitation' }))),
    ).toMatch(/whatsapp_messages_invitation_subject/);
    expect(
      await refusal(app.insert(whatsappMessages).values(queued({ kind: 'auto_reply' }))),
    ).toMatch(/whatsapp_messages_reply_session/);
    await app
      .insert(whatsappMessages)
      .values(queued({ kind: 'invitation', subjectTenantId: uuidv7(), subjectId: uuidv7() }));
  });

  it('gives a reason exactly to failed and expired messages', async () => {
    expect(
      await refusal(app.insert(whatsappMessages).values(queued({ status: 'failed' }))),
    ).toMatch(/whatsapp_messages_failure_reason/);
    expect(
      await refusal(
        app.insert(whatsappMessages).values(queued({ failureReason: 'transport_error' })),
      ),
    ).toMatch(/whatsapp_messages_failure_reason/);
    await app
      .insert(whatsappMessages)
      .values(queued({ status: 'expired', failureReason: 'deadline', bodySealed: null }));
  });

  it('makes one message per outbox event, per OTP challenge and per transport id', async () => {
    const sourceEventId = uuidv7();
    await app.insert(whatsappMessages).values(queued({ sourceEventId }));
    expect(await refusal(app.insert(whatsappMessages).values(queued({ sourceEventId })))).toMatch(
      /whatsapp_messages_source_event_unique/,
    );

    const [account] = await app.insert(accounts).values({ phone: '+999100000301' }).returning();
    const [challenge] = await app
      .insert(otpChallenges)
      .values({
        accountId: account?.id ?? '',
        purpose: 'device_sign_in',
        codeHash: 'synthetic-code-hash',
        expiresAt: new Date(Date.now() + 5 * minute),
        deliveryStatus: 'queued',
      })
      .returning();
    const otp = queued({ kind: 'otp', otpChallengeId: challenge?.id ?? '' });
    await app.insert(whatsappMessages).values(otp);
    expect(await refusal(app.insert(whatsappMessages).values(otp))).toMatch(
      /whatsapp_messages_otp_challenge_unique/,
    );

    const session = await createSession({ state: 'connected' });
    const sent = queued({ sessionId: session.id, status: 'sent', transportMessageId: 'ABC' });
    await app.insert(whatsappMessages).values(sent);
    expect(await refusal(app.insert(whatsappMessages).values(sent))).toMatch(
      /whatsapp_messages_session_transport_id_unique/,
    );
  });

  it('lets the app role delete old rows (the sweep)', async () => {
    const [row] = await app.insert(whatsappMessages).values(queued()).returning();
    await app.delete(whatsappMessages).where(eq(whatsappMessages.id, row?.id ?? ''));
  });
});

describe('whatsapp_opt_outs', () => {
  it('keeps one choice per scope and recipient, never deleted', async () => {
    const choice = {
      scope: 'platform',
      recipientHash: 'synthetic-recipient-hash',
      optedOutAt: new Date(),
      lastKeywordAt: new Date(),
    };
    await app.insert(whatsappOptOuts).values(choice);
    expect(await refusal(app.insert(whatsappOptOuts).values(choice))).toMatch(
      /whatsapp_opt_outs_scope_recipient_unique/,
    );
    expect(
      await refusal(app.insert(whatsappOptOuts).values({ ...choice, scope: 'clinic' })),
    ).toMatch(/whatsapp_opt_outs_scope/);
    expect(await refusal(app.delete(whatsappOptOuts))).toMatch(/permission denied/);
  });
});

describe('the S02 values S03 adds', () => {
  it('accepts every OTP delivery status and refuses others', async () => {
    const [account] = await app.insert(accounts).values({ phone: '+999100000302' }).returning();
    const challenge = (deliveryStatus: string) =>
      app.insert(otpChallenges).values({
        accountId: account?.id ?? '',
        purpose: 'first_sign_in',
        codeHash: 'synthetic-code-hash',
        expiresAt: new Date(Date.now() + 5 * minute),
        deliveryStatus,
      });
    for (const status of ['queued', 'sent', 'delivered', 'failed']) await challenge(status);
    expect(await refusal(challenge('read'))).toMatch(/otp_challenges_delivery_status/);
  });
});
