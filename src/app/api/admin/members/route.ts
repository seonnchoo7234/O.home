// 관리자 전용 회원 관리 라우트 (v2.x)
//
// 공개 회원가입(가입코드 방식)을 없애고, 회원 계정 생성·삭제를 관리자가 홈에서 직접 하도록
// 옮긴다. 계정을 만들고 지우려면 관리자 키(Firebase 서비스 계정)가 필요한데, 그 키를
// 브라우저에 두면 누구나 남의 계정을 지울 수 있게 된다 — 그래서 키는 **서버 환경변수에만**
// 두고 이 라우트에서만 쓴다.
//
// 보안: 클라이언트가 보낸 토큰을 서버가 직접 검증해 「정말 이 홈의 관리자인가」를 확인한 뒤에만
// 계정을 건드린다. 클라이언트의 주장(role=admin 등)은 신뢰하지 않는다.
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

/** 서버가 알아야 할 연결 정보 — 프로젝트 ID와 (쓰는 경우) Firestore 데이터베이스 ID */
interface ServerCfg { projectId: string; databaseId?: string }

/** 설치 화면이 내려준 공개 설정(public/ohome.config.json) 또는 NEXT_PUBLIC_* 환경변수에서 읽는다.
 *  데이터베이스 ID까지 읽어야 **화면이 보는 DB와 관리자 라우트가 건드리는 DB가 같아진다** —
 *  이름 있는(named) 데이터베이스를 쓰는 홈에서 회원 생성/삭제가 조용히 다른 DB로 새는 것을 막는다. */
async function loadConfig(): Promise<ServerCfg | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'public', 'ohome.config.json'), 'utf8');
    const o = JSON.parse(raw) as Record<string, string>;
    if (o?.projectId) return { projectId: o.projectId, databaseId: o.databaseId || undefined };
  } catch { /* 파일이 없으면 환경변수로 */ }
  const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (pid) return { projectId: pid, databaseId: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || undefined };
  return null;
}

function bearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

type FirebaseApp = import('firebase-admin/app').App;
type Firestore = import('firebase-admin/firestore').Firestore;

async function firebaseApp(projectId: string): Promise<FirebaseApp | null> {
  const { getApps, initializeApp, cert } = await import('firebase-admin/app');
  if (getApps().length) return getApps()[0];
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  let raw: Record<string, string> = {};
  if (json) {
    try { raw = JSON.parse(json) as Record<string, string>; } catch { return null; }
  } else {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!clientEmail || !privateKey) return null;
    raw = { client_email: clientEmail, private_key: privateKey, project_id: process.env.FIREBASE_PROJECT_ID ?? projectId };
  }
  const projectIdResolved = raw.project_id ?? raw.projectId ?? projectId;
  const clientEmail = raw.client_email ?? raw.clientEmail;
  const privateKey = (raw.private_key ?? raw.privateKey)?.replace(/\\n/g, '\n');
  if (!projectIdResolved || !clientEmail || !privateKey) return null;
  return initializeApp({ credential: cert({ projectId: projectIdResolved, clientEmail, privateKey }) });
}

/** 화면과 **같은** Firestore 인스턴스 — 이름 있는 DB면 그 이름으로 연다 */
async function adminDb(app: FirebaseApp, databaseId?: string): Promise<Firestore> {
  const { getFirestore } = await import('firebase-admin/firestore');
  const id = (databaseId ?? '').trim();
  return id && id !== '(default)' ? getFirestore(app, id) : getFirestore(app);
}

/** 호출자 토큰이 이 홈의 소유자·관리자인지 확인 */
async function requireOwner(cfg: ServerCfg, token: string): Promise<{ app: FirebaseApp; uid: string } | { res: NextResponse }> {
  const app = await firebaseApp(cfg.projectId);
  if (!app) return { res: fail('서버에 Firebase 서비스 계정 환경변수(FIREBASE_SERVICE_ACCOUNT 또는 FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY)가 없습니다.', 501) };
  const { getAuth } = await import('firebase-admin/auth');
  let uid: string;
  try { uid = (await getAuth(app).verifyIdToken(token)).uid; }
  catch { return { res: fail('로그인 정보가 올바르지 않습니다 — 다시 로그인해 주세요.', 401) }; }
  const snap = await (await adminDb(app, cfg.databaseId)).doc('meta/owner').get();
  const own = snap.data() as { uid?: string; admins?: string[] } | undefined;
  if (!(own?.uid === uid || (own?.admins ?? []).includes(uid))) {
    return { res: fail('관리자만 회원을 관리할 수 있습니다.', 403) };
  }
  return { app, uid };
}

interface MemberInput { email: string; password: string; nickname: string }

export async function POST(req: NextRequest) {
  const cfg = await loadConfig();
  if (!cfg) return fail('서버 연결 설정을 찾지 못했습니다 — public/ohome.config.json 또는 NEXT_PUBLIC_FIREBASE_* 환경변수를 확인해 주세요.', 501);
  const token = bearer(req);
  if (!token) return fail('로그인이 필요합니다.', 401);
  const body = (await req.json().catch(() => null)) as Partial<MemberInput> | null;
  const email = (body?.email ?? '').trim();
  const password = body?.password ?? '';
  const nickname = (body?.nickname ?? '').trim() || email.split('@')[0];
  if (!email || !password) return fail('이메일과 비밀번호를 입력해 주세요.', 400);
  if (password.length < 6) return fail('비밀번호는 6자 이상이어야 합니다.', 400);

  try {
    const got = await requireOwner(cfg, token);
    if ('res' in got) return got.res;
    const { getAuth } = await import('firebase-admin/auth');
    const u = await getAuth(got.app).createUser({ email, password, displayName: nickname, emailVerified: true });
    await (await adminDb(got.app, cfg.databaseId)).doc(`profiles/${u.uid}`).set(
      { nickname, role: 'member', createdAt: Date.now() }, { merge: true });
    return NextResponse.json({ ok: true, id: u.uid });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if ((err.code ?? '').includes('email-already-exists')) return fail('이미 사용 중인 이메일입니다.', 409);
    return fail(err.message ?? '회원을 만들지 못했습니다.', 400);
  }
}

export async function DELETE(req: NextRequest) {
  const cfg = await loadConfig();
  if (!cfg) return fail('서버 연결 설정을 찾지 못했습니다.', 501);
  const token = bearer(req);
  if (!token) return fail('로그인이 필요합니다.', 401);
  const id = new URL(req.url).searchParams.get('id')?.trim() ?? '';
  if (!id) return fail('삭제할 회원을 지정해 주세요.', 400);

  const got = await requireOwner(cfg, token);
  if ('res' in got) return got.res;
  if (id === got.uid) return fail('자기 자신(관리자)은 지울 수 없습니다.', 400);

  const { getAuth } = await import('firebase-admin/auth');
  const db = await adminDb(got.app, cfg.databaseId);

  const errs: string[] = [];
  // ① 로그인 계정(Auth) 삭제 — 이미 없으면(user-not-found) 넘어간다.
  //    여기서 멈추면 프로필이 남아 목록에 계속 보이므로, 실패해도 ② 는 반드시 시도한다.
  try { await getAuth(got.app).deleteUser(id); }
  catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (!code.includes('user-not-found')) errs.push(`auth: ${(e as Error).message}`);
  }
  // ② 프로필 문서 삭제 — 목록(listMembers)은 이 문서를 읽으므로, 지워야 화면에서 사라진다.
  try { await db.doc(`profiles/${id}`).delete(); }
  catch (e) { errs.push(`profile: ${(e as Error).message}`); }

  if (errs.length) return fail(`삭제 중 오류가 있었습니다 — ${errs.join(' / ')}`, 500);
  return NextResponse.json({ ok: true });
}
