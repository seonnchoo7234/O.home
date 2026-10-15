import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  try {
    const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
    const origin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';

    // Generate registration options
    const options = await generateRegistrationOptions({
      rpName: 'O.home',
      rpID: rpID,
      userName: userId,
      userID: Buffer.from(userId),
    });

    const response = NextResponse.json({
      challenge: options.challenge,
      rp: options.rp,
      user: options.user,
      pubKeyCredParams: options.pubKeyCredParams,
      authenticatorSelection: options.authenticatorSelection,
      attestation: options.attestation,
    });

    // Set the challenge in a cookie for verification
    response.cookies.set('reg_challenge_id', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Error generating registration options:', error);
    return NextResponse.json({ error: 'Failed to generate registration options' }, { status: 500 });
  }
}
