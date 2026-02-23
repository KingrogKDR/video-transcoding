export const AUTH_CONFIG = {
  // bcrypt rounds for password hashing
  BCRYPT_ROUNDS: 12,

  // JWT expiry times
  ACCESS_TOKEN_EXPIRY: "15m",
  REFRESH_TOKEN_EXPIRY: "7d",

  // Refresh token expiry in milliseconds (for DB storage)
  REFRESH_TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000, // 7 days

  // Password requirements
  MIN_PASSWORD_LENGTH: 8,
} as const;
