/**
 * 비밀번호 정책 (leaf 모듈 — 순환참조 방지)
 * 비밀번호를 설정하는 모든 지점(자가 변경·신규 등록·마스터 재설정)에서 공유한다.
 */

export const DEFAULT_PASSWORD = "0000";
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 20;

export function isDefaultPassword(pw: string): boolean {
  return pw === DEFAULT_PASSWORD;
}

/**
 * 새 비밀번호 검증. 통과하면 null, 실패하면 사용자용 오류 메시지를 반환.
 * 허용: 공백·제어문자를 제외한 4~20자 (영문/숫자/특수문자). 기본 비밀번호(0000) 거부.
 */
export function validateNewPassword(pw: string): string | null {
  if (pw.length < PASSWORD_MIN || pw.length > PASSWORD_MAX) {
    return `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자여야 합니다.`;
  }
  if (/\s/.test(pw)) {
    return "비밀번호에 공백은 사용할 수 없습니다.";
  }
  // 제어문자(비출력 문자) 불가 — 출력 가능한 문자만 허용
  for (const ch of pw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      return "비밀번호에 사용할 수 없는 문자가 포함되어 있습니다.";
    }
  }
  if (isDefaultPassword(pw)) {
    return "기본 비밀번호(0000)는 사용할 수 없습니다.";
  }
  return null;
}
