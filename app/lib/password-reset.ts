import crypto from 'crypto';

export const PASSWORD_RESET_PURPOSE = 'PASSWORD_RESET';
export const PASSWORD_RESET_EXPIRE_MINUTES = 10;
export const PASSWORD_RESET_COOLDOWN_SECONDS = 60;
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;

function getCodeSecret() {
  return (
    process.env.PASSWORD_RESET_CODE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'dev-password-reset-secret'
  );
}

export function generateSixDigitCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashResetCode(email: string, code: string) {
  return crypto
    .createHash('sha256')
    .update(`${email.toLowerCase()}:${code}:${getCodeSecret()}`)
    .digest('hex');
}
