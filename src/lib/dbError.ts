// 서버가 돌려준 오류를 사람이 할 수 있는 일로 바꿔 준다 (v2.0)
//  — 원문만 보여 주면 무엇을 해야 할지 알 수 없고, 감추면 원인을 못 찾는다.

/** 겪어 본 오류는 원인과 해결 방법으로 바꿔 준다 — 원문만으로는 무엇을 해야 할지 모른다 */
export function explainDbError(msg: string): string {
  const m = msg.toLowerCase();
  // Firestore가 규칙 거부를 돌려주는 문구 (v2.0 포크 제보 — 편집 권한 회원의 저장 거부).
  // 규칙이 옛 버전이거나, 업데이트 전에 준 편집 권한이 문서에 아직 반영 전일 수 있다 —
  // 후자는 관리자가 캐릭터 목록을 한 번 열면 자동으로 다시 계산된다.
  if (m.includes('insufficient permissions') || m.includes('permission denied')
    || m.includes('missing or insufficient permissions')) {
    return '보안 규칙에 막혔습니다 — ① Firebase 콘솔의 규칙을 환경설정 > 회원/보안의 최신 규칙으로 다시 붙여넣고 '
      + '② 편집 권한 관련이면 관리자가 캐릭터 목록을 한 번 열어 준 뒤 다시 시도해 주세요';
  }
  return msg;
}
