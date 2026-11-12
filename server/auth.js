// server/auth.js — hash password (scrypt) & token bertanda tangan (HMAC)
// Hanya memakai modul bawaan Node.js, jadi tidak perlu bcrypt/jsonwebtoken.
const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'ganti-secret-ini-di-env';
const TOKEN_TTL = 60 * 60 * 12; // 12 jam

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password), salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function sign(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}

function signToken(payload) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL }),
  ).toString('base64url');
  return `${body}.${sign(body)}`;
}

function verifyToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
