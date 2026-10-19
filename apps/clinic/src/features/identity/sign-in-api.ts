import type { ProofOfWorkSolution, RegistrationOptions } from '@vertex-shifa/contracts';
import { api, DEVICE_TOKEN_HEADER, TICKET_HEADER, unwrap } from '../../lib/api';
import { device, type RegistrationView } from '../../lib/device';
import { deviceToken } from './session';

// The sign-in routes (spec S02 rules 12–15): public, with a proof of work, before any session.

/** Rule 14: a proof-of-work challenge solved by the main process (ADR 0016). */
async function proofOfWork(): Promise<ProofOfWorkSolution> {
  const { challenge, difficulty } = await unwrap(api.POST('/api/auth/pow'));
  const nonce = await device('solveProofOfWork', { challenge, difficulty });
  return { challenge, nonce };
}

/**
 * Phone and password. On a registration where the person is enrolled, the device token makes it
 * the whole sign-in (`done`); elsewhere an OTP follows.
 */
export async function signIn(
  phone: string,
  password: string,
  registration: Pick<RegistrationView, 'deviceId' | 'tenantId'> | undefined,
) {
  const proof = await proofOfWork();
  const headers: Record<string, string> = registration
    ? { [DEVICE_TOKEN_HEADER]: await deviceToken(registration) }
    : {};
  return unwrap(
    api.POST('/api/auth/sign-in', { headers, body: { phone, password, proofOfWork: proof } }),
  );
}

/** Rule 15: a first sign-in's OTP; the answer is the same whether a code was sent or not. */
export async function requestFirstSignIn(phone: string) {
  const proof = await proofOfWork();
  return unwrap(
    api.POST('/api/auth/otp/request', {
      body: { phone, purpose: 'first_sign_in', proofOfWork: proof },
    }),
  );
}

/**
 * Rule 16: a password reset's OTP, sent only within the 72 hours an owner (or Vertex support)
 * authorized; the answer is the same for any other phone.
 */
export async function requestPasswordReset(phone: string) {
  const proof = await proofOfWork();
  return unwrap(
    api.POST('/api/auth/otp/request', {
      body: { phone, purpose: 'password_reset', proofOfWork: proof },
    }),
  );
}

export function resendOtp(challengeId: string) {
  return unwrap(api.POST('/api/auth/otp/resend', { body: { challengeId } }));
}

export function verifyOtp(challengeId: string, code: string) {
  return unwrap(api.POST('/api/auth/otp/verify', { body: { challengeId, code } }));
}

/** The first password, with the person's name; answers a `signed_in` ticket. */
export async function setFirstPassword(ticket: string, name: string, password: string) {
  const { ticket: signedIn } = await unwrap(
    api.POST('/api/auth/password', {
      headers: { [TICKET_HEADER]: ticket },
      body: { name, password },
    }),
  );
  return signedIn;
}

/** Rule 16: the new password after an authorized reset; answers a `signed_in` ticket. */
export async function setNewPassword(ticket: string, password: string) {
  const { ticket: signedIn } = await unwrap(
    api.POST('/api/auth/password', { headers: { [TICKET_HEADER]: ticket }, body: { password } }),
  );
  return signedIn;
}

/** Rule 27: the clinics and branches where the account may register this computer. */
export async function registrationOptions(ticket: string): Promise<RegistrationOptions> {
  return unwrap(
    api.GET('/api/auth/registration-options', { headers: { [TICKET_HEADER]: ticket } }),
  );
}
