// ─── Shared Crypto Utilities ──────────────────────────────────────────────────
// Generates AES-256 keys, IVs, and signs device JWT tokens.
// Used by both mock and real repositories.

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const DEVICE_JWT_SECRET = process.env.JWT_DEVICE_SECRET ?? 'zappi-device-secret-CHANGE-IN-PROD';
const DEVICE_TOKEN_EXPIRY = '30m';

/**
 * Generate a random AES-256 key (32 bytes) and IV (16 bytes).
 * Format: decimal values (0-255) separated by pipes, e.g. "58|210|67|147|..."
 * Compatible with Java's Integer.valueOf() decimal parsing.
 */
export function generateDeviceCrypto(): { key: string; iv: string } {
  const keyBytes = crypto.randomBytes(32);
  const ivBytes  = crypto.randomBytes(16);

  const toDecimalPiped = (bytes: Buffer): string =>
    Array.from(bytes)
      .map(b => b.toString(10))
      .join('|');

  return {
    key: toDecimalPiped(keyBytes),
    iv:  toDecimalPiped(ivBytes),
  };
}

/**
 * Sign a device JWT with a 30-minute expiry.
 * Payload contains: deviceId, certifiedId, role=device
 */
export function signDeviceToken(payload: {
  deviceId: string;
  certifiedId: number;
}): string {
  return jwt.sign(
    { ...payload, role: 'device' },
    DEVICE_JWT_SECRET,
    { expiresIn: DEVICE_TOKEN_EXPIRY, algorithm: 'HS256' },
  );
}

/**
 * Verify a device JWT. Returns decoded payload or throws.
 */
export function verifyDeviceToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, DEVICE_JWT_SECRET) as jwt.JwtPayload;
}
