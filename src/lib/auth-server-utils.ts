// src/lib/auth-server-utils.ts
// In a production environment, challenges should be stored in a secure, session-based store (e.g., Redis or a database).
// For development/demonstration, we use an in-memory store.

export const AUTH_CHALLENGE_COOKIE = 'auth_challenge_id';
export const AUTH_2FA_VERIFIED_COOKIE = 'auth_2fa_verified';

const challengeStore = new Map<string, { options: any; userId?: string }>();

export function saveChallenge(challengeId: string, options: any, userId?: string) {
  challengeStore.set(challengeId, { options, userId });
}

export function getChallenge(challengeId: string) {
  return challengeStore.get(challengeId);
}

export function removeChallenge(challengeId: string) {
  challengeStore.delete(challengeId);
}
