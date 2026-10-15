import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { saveChallenge, AUTH_CHALLENGE_COOKIE } from '@/lib/auth-server-utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  try {
    const rpID = process.env.WEBAUTHN_RP_ID || '';
    const origin = process.env.WEBAUTHN_ORIGIN || '';

    const options = await generateAuthenticationOptions({
      rpID: rpID,
      allowCredentials: [], // In production, this should contain the user's registered credential IDs
      userVerification: 'preferred',
    });

    const challengeId = crypto.randomUUID();
    saveChallenge(challengeId, options, userId ?? undefined);

    const response = NextResponse.json({
      challenge: options.challenge,
      allowCredentials: options.allowCredentials,
    });

    // Set the HttpOnly cookie
    response.cookies.set(AUTH_CHALLENGE_COOKIE, challengeId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Error generating authentication options:', error);
    return NextResponse.json({ error: 'Failed to generate challenge' }, { status: 500 });
  }
}
