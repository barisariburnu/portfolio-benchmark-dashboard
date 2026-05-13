import { SignJWT, jwtVerify } from 'jose';
import { db } from '@/lib/db';

// ── Configuration ────────────────────────────────────────────────────────────
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'portfolio-benchmark-dashboard-secret-key-change-in-production'
);

const COOKIE_NAME = 'auth-token';
const TOKEN_EXPIRY = '7d'; // 7 days

// ── Password Hashing ─────────────────────────────────────────────────────────
// Using Web Crypto API (available in Node.js and Edge Runtime)

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  // Also generate a random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltedData = new Uint8Array(data.length + salt.length);
  saltedData.set(data);
  saltedData.set(salt, data.length);
  const saltedHash = await crypto.subtle.digest('SHA-256', saltedData);
  // Store as: salt:hash (both hex encoded)
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(saltedHash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const [saltHex, originalHashHex] = storedHash.split(':');
  if (!saltHex || !originalHashHex) return false;

  // Decode salt
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
  const saltedData = new Uint8Array(data.length + salt.length);
  saltedData.set(data);
  saltedData.set(salt, data.length);
  const saltedHash = await crypto.subtle.digest('SHA-256', saltedData);
  const hashHex = Array.from(new Uint8Array(saltedHash)).map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex === originalHashHex;
}

// ── JWT Token ────────────────────────────────────────────────────────────────

export interface TokenPayload {
  userId: string;
  username: string;
}

export async function signToken(payload: TokenPayload): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
  return token;
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as string,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}

// ── Cookie Helpers ───────────────────────────────────────────────────────────

export function getCookieName(): string {
  return COOKIE_NAME;
}

// ── Auth Helper for API Routes ───────────────────────────────────────────────

export async function getUserFromRequest(request: Request): Promise<{ userId: string; username: string } | null> {
  // First try to get userId from middleware header
  const headerUserId = request.headers.get('x-user-id');
  const headerUsername = request.headers.get('x-user-username');
  if (headerUserId && headerUsername) {
    return { userId: headerUserId, username: headerUsername };
  }

  // Fallback: try to get token from cookie directly
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );

  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  // Verify user still exists
  const user = await db.user.findUnique({ where: { id: payload.userId } });
  if (!user) return null;

  return { userId: user.id, username: user.username };
}
