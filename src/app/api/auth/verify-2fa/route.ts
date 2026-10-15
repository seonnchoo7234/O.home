import { NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, getDocs } from 'firebase/firestore';
import { getChallenge, removeChallenge, AUTH_CHALLENGE_COOKIE } from '@/lib/auth-server-utils';
import { cookies } from 'next/headers';

/** Lazily create the Firestore instance — called once per server process */
let _db: ReturnType<typeof getFirestore> | null = null;

function db(): ReturnType<typeof getFirestore> {
  if (!_db) {
    if (!getApps().length) {
      initializeApp(); // reads NEXT_PUBLIC_FIREBASE_* env vars automatically
    }
    _db = getFirestore();
  }
  return _db;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { assertion } = body as { assertion: any };

    if (!assertion) {
      return NextResponse.json({ error: 'Missing assertion' }, { status: 400 });
    }

    // Retrieve challengeId from cookies (Next.js App Router API)
    const cookieStore = await cookies();
    const challengeId = cookieStore.get(AUTH_CHALLENGE_COOKIE)?.value;

    if (!challengeId) {
      return NextResponse.json({ error: 'No challenge session found' }, { status: 400 });
    }

    const stored = getChallenge(challengeId);
    if (!stored) {
      return NextResponse.json({ error: 'Invalid or expired challenge' }, { status: 400 });
    }

    const originalChallenge = stored.options.challenge;

    // Find the user's credential by credential ID from the assertion
    const credId = assertion.id;
    if (!credId) {
      return NextResponse.json({ error: 'Missing credential ID' }, { status: 400 });
    }

    // Search all users' webauthn_credentials for this credential ID
    const usersSnap = await getDocs(query(collection(db(), 'profiles')));

    let userCredential: { id: string; publicKey: Uint8Array; counter: number } | null = null;
    let userId: string | null = null;

    for (const userDoc of usersSnap.docs) {
      const credSnap = await getDoc(doc(db(), 'profiles', userDoc.id, 'webauthn_credentials', credId));
      if (credSnap.exists()) {
        const data = credSnap.data() as { publicKey: number[]; counter: number };
        userCredential = {
          id: credId,
          publicKey: new Uint8Array(data.publicKey),
          counter: data.counter,
        };
        userId = userDoc.id;
        break;
      }
    }

    if (!userCredential) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 401 });
    }

    // Verify the authentication response
    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: originalChallenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
      expectedRPID: process.env.WEBAUTHN_RP_ID || 'localhost',
      credential: {
        id: userCredential.id,
        publicKey: userCredential.publicKey as never,
        counter: userCredential.counter,
        transports: assertion.response.transports,
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // Update the counter to prevent replay attacks
    if (userId) {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db(), 'profiles', userId, 'webauthn_credentials', credId), {
        counter: verification.authenticationInfo.newCounter,
      }, { merge: true });
    }

    // Cleanup the challenge after successful verification
    removeChallenge(challengeId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('2FA verification error:', e);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
