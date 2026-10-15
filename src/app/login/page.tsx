'use client';
// 로그인 페이지 (4.8) — 회원정보창 위젯은 버튼만 두고 여기로 이동 (위젯 크기 유지 목적)
// 비밀번호 찾기 포함 — 회원가입은 없앴다(관리자가 환경설정에서 계정을 만든다)
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { startAuthentication } from '@simplewebauthn/browser';
import { useToast } from '@/components/ui/Toast';
import { KInput } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { EditableDesc } from '@/components/ui/PageText';

export default function LoginPage() {
  const router = useRouter();
  const { user, login, findId, resetPassword, mock, verify2FA, pending2FA, setPending2FA } = useAuth();
  const toast = useToast();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<{ challenge: any; allowCredentials: any[] } | null>(null);
  const [twoFactorChallengeId, setTwoFactorChallengeId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  // 아이디/비밀번호 찾기
  const [fEmail, setFEmail] = useState('');
  const [fErr, setFErr] = useState('');
  const [fInfo, setFInfo] = useState('');     // 결과 안내 (아이디·임시 비밀번호)

  // 이미 로그인 상태면 메인으로 (2FA 대기 중이면 리디렉션 안 함)
  useEffect(() => { if (user && !pending2FA) router.replace('/'); }, [user, router, pending2FA]);

  const doLogin = async () => {
    setErr('');
    const r = await login(id.trim(), pw);
    if (!r.ok) { setErr(r.error ?? '로그인 실패'); return; }
    if (r.requires2FA) {
      setTwoFactorChallengeId(r.challengeId ?? null);
      try {
        const res = await fetch(`/api/auth/get-challenge?userId=${id.trim()}`);
        const data = (await res.json().catch(() => ({}))) as { challenge: any; allowCredentials: any[] };
        if (!data.challenge) { setErr('2FA 챌린지를 가져오지 못했습니다.'); return; }
        setTwoFactorChallenge(data);
      } catch (e) {
        setErr('2FA 챌린지 요청 실패');
      }
      return;
    }
    // 2FA 불필요 — 로그인 완료
    setPending2FA(false);
    toast('로그인되었습니다');
    router.push('/');
  };

  const doVerify2FA = async () => {
    if (!twoFactorChallenge || !twoFactorChallengeId) return;
    setIsVerifying(true);
    try {
      const assertion = await startAuthentication({ optionsJSON: twoFactorChallenge });
      const r = await verify2FA(twoFactorChallengeId, assertion); 
      if (r.ok) {
        setPending2FA(false);
        toast('2FA 인증 성공');
        router.push('/');
      } else {
        setErr(r.error ?? '2FA 인증 실패');
      }
    } catch (e) {
      setErr('2FA 인증 중 오류가 발생했습니다.');
    } finally {
      setIsVerifying(false);
    }
  };

  // 아이디 찾기 (v1.9) — 가입 이메일로
  const doFindId = async () => {
    setFErr(''); setFInfo('');
    const r = await findId(fEmail.trim());
    if (!r.ok) { setFErr(r.error ?? '요청 실패'); return; }
    setFInfo(`아이디: ${r.foundId}`);
  };

  const doFind = async () => {
    setFErr(''); setFInfo('');
    const r = await resetPassword(fEmail.trim());
    if (!r.ok) { setFErr(r.error ?? '요청 실패'); return; }
    if (r.tempPassword) setFInfo(`임시 비밀번호: ${r.tempPassword} — 로그인 후 마이페이지에서 변경해 주세요`);
    else { setFindOpen(false); toast('재설정 링크을 이메일로 보냈습니다'); }
  };

  return (
    <section className="page">
      {/* 타이틀은 카드 안 가운데 정렬 (v1.9 — 메뉴 페이지가 아니라 상단 대제목을 두지 않음) */}
      <div className="panel" style={{ padding: 28, maxWidth: 480, margin: '40px auto 0' }}>
        <h1 style={{
          fontFamily: 'var(--serif)', fontSize: 24, letterSpacing: '.3em', textAlign: 'center',
          margin: '4px 0 6px', color: 'var(--ink)',
        }}>LOGIN</h1>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <EditableDesc k="login-desc" def="로그인 후 멤버 전용 콘텐츠를 열람할 수 있습니다" />
        </div>
        <div style={{ display: 'grid', gap: 9 }}>
          <KInput placeholder="아이디" value={id} onChange={e => setId(e.target.value)} />
          <KInput placeholder="비밀번호" type="password" value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doLogin(); }} />
          {err && <p style={{ fontSize: 11.5, color: 'var(--accent)' }}>{err}</p>}
          <button className="btn btn-dark" style={{ justifyContent: 'center', padding: 10 }} onClick={doLogin}>로그인</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
            onClick={() => setFindOpen(true)}>비밀번호 찾기</button>
        </div>
      </div>

      {/* 2FA 인증 모달 */}
      <Modal open={!!twoFactorChallenge} onClose={() => { setTwoFactorChallenge(null); setErr(''); }} small
        title="2FA 인증"
        desc="보안을 위해 2차 인증을 진행해 주세요."
        actions={<>
          <button className="btn btn-ghost" onClick={() => { setTwoFactorChallenge(null); }}>CANCEL</button>
          <button className="btn btn-dark" onClick={doVerify2FA} disabled={isVerifying}>
            {isVerifying ? '인증 중...' : '인증하기'}
          </button>
        </>}>
        <div style={{ textAlign: 'center', padding: 20 }}>
          <p>보안 키를 사용하거나 생체 인식을 완료해 주세요.</p>
        </div>
      </Modal>

      {/* 아이디·비밀번호 찾기 모달 (4.8, v1.9) — 가입 이메일 기준 */}
      <Modal open={findOpen} onClose={() => { setFindOpen(false); setFInfo(''); setFErr(''); }} small
        title={mock ? '아이디·비밀번호 찾기' : '비밀번호 재설정'}
        desc={mock
          ? '가입 시 등록한 이메일로 아이디를 찾거나 임시 비밀번호를 발급합니다'
          : '가입한 이메일로 재설정 링크를 보냅니다'}
        dirty={!!fEmail}
        actions={<>
          <button className="btn btn-ghost" onClick={() => { setFindOpen(false); setFInfo(''); setFErr(''); }}>CANCEL</button>
          {/* 서버 모드는 이메일이 곧 아이디라 「아이디 찾기」가 의미 없다 */}
          {mock && <button className="btn btn-ghost" onClick={doFindId}>아이디 찾기</button>}
          <button className="btn btn-dark" onClick={doFind}>{mock ? '임시 비밀번호' : 'SEND'}</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <KInput placeholder="이메일" value={fEmail} onChange={e => setFEmail(e.target.value)} />
          {fErr && <p style={{ fontSize: 11.5, color: 'var(--accent)' }}>{fErr}</p>}
          {fInfo && <p style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{fInfo}</p>}
        </div>
      </Modal>
    </section>
  );
}