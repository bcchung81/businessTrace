export type PasswordCheck = { ok: true } | { ok: false; message: string };

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

/**
 * 비밀번호 강도를 판정한다.
 * 12~128자, 영문·숫자·특수문자 중 2가지 조합. 레이트리밋만으로는 짧은 비밀번호를 지켜 주지 못한다.
 */
export function checkPasswordStrength(password: string): PasswordCheck {
  if (!password) return { ok: false, message: "비밀번호를 입력해주세요." };
  if (password.length < MIN_LENGTH) {
    return { ok: false, message: `비밀번호는 최소 ${MIN_LENGTH}자 이상이어야 합니다.` };
  }
  if (password.length > MAX_LENGTH) {
    return { ok: false, message: `비밀번호는 최대 ${MAX_LENGTH}자까지 가능합니다.` };
  }

  const classes = [/[a-zA-Z]/, /\d/, /[!@#$%^&*(),.?":{}|<>]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (classes < 2) {
    return { ok: false, message: "비밀번호는 영문, 숫자, 특수문자 중 최소 2가지 조합이어야 합니다." };
  }

  return { ok: true };
}
