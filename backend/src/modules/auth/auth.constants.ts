import { API_PREFIX } from '../../config/api-prefix.js';

/** Access token JWT: 15 menit. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Refresh token: 7 hari sejak diterbitkan (setiap rotasi memperpanjang). */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Link reset password: 30 menit, sekali pakai. */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export const REFRESH_COOKIE_NAME = 'refresh_token';

/** Cookie hanya dikirim browser ke endpoint auth, tidak ke API lain. */
export const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth`;

export const PASSWORD_MIN_LENGTH = 8;
/** Batas atas supaya hashing argon2 tidak bisa dipakai untuk DoS. */
export const PASSWORD_MAX_LENGTH = 128;

export const AuthMessages = {
  invalidCredentials: 'Email atau password salah',
  inactiveAccount: 'Akun nonaktif. Hubungi HR.',
  sessionInvalid: 'Sesi tidak valid. Silakan login ulang.',
  sessionExpired: 'Sesi berakhir. Silakan login ulang.',
  sessionReused:
    'Sesi terdeteksi dipakai ulang. Semua sesi di perangkat ini dicabut, silakan login ulang.',
  resetTokenInvalid: 'Link reset password tidak valid atau sudah kedaluwarsa',
  forgotPasswordAccepted:
    'Jika email terdaftar, link reset password sudah dikirim.',
  passwordResetDone: 'Password berhasil diubah. Silakan login ulang.',
} as const;

export const AuditActions = {
  loginSuccess: 'auth.login_success',
  loginFailed: 'auth.login_failed',
  refreshReuse: 'auth.refresh_reuse_detected',
  passwordReset: 'auth.password_reset',
} as const;
