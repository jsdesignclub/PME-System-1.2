// Phase 0 holds constants only. The signing/verification helpers arrive in
// Phase 1, when there is an actual token to sign.
//
// Kept separate from server.js so that auth concerns have one home, and so
// Phase 1 can add behaviour here without touching the bootstrap path.

/**
 * Read and validate JWT configuration. Called by server.js at startup so a
 * missing or placeholder secret fails loudly instead of silently signing
 * tokens that anybody can forge.
 *
 * @throws {Error} if the secret is absent or still a `.env.example` placeholder
 */
export function getJwtConfig() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not set. Copy backend/.env.example to backend/.env and fill it in.');
  }
  if (secret === 'change-me') {
    throw new Error('JWT_SECRET is still the .env.example placeholder. Generate a real one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  }

  return {
    secret,
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '14d',
  };
}
