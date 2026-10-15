import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { cookies } from 'next/headers';

/** Lazily create the Firestore instance */
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
    const { credential, userId, name } = body as {
      credential: any;
      userId: string;
      name: string;
    };

    if (!credential || !userId) {
      return NextResponse.json({ error: 'Missing credential or userId' }, { status: 400 });
    }

    // Get the challenge from the cookie set during registration options generation
    const cookieStore = await cookies();
    const challenge = cookieStore.get('reg_challenge_id')?.value;
    if (!challenge) {
      return NextResponse.json({ error: 'No registration challenge found' }, { status: 400 });
    }

    // Verify the registration response
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
      expectedRPID: process.env.WEBAUTHN_RP_ID || 'localhost',
    });

    if (!verification.verified) {
      return NextResponse.json({ error: 'Registration verification failed' }, { status: 400 });
    }

    // Store the credential in Firestore
    const publicKey = Array.from(verification.registrationInfo.credential.publicKey);
    await setDoc(doc(db(), 'profiles', userId, 'webauthn_credentials', verification.registrationInfo.credential.id), {
      publicKey,
      counter: 0,
      name: name || 'Security Key',
      createdAt: Date.now(),
    }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('2FA registration error:', e);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
