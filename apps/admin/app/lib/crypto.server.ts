import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env.server';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacSign(value: string, secret = env.SESSION_SECRET): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function sign(value: string): string {
  return `${value}.${hmacSign(value)}`;
}

export function verifySigned(signed: string): string | null {
  const dot = signed.lastIndexOf('.');
  if (dot < 0) return null;
  const value = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = hmacSign(value);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return value;
}

// Daily-rotated salt for IP hashing (so we never store raw IPs).
export function dailySalt(): string {
  const day = new Date().toISOString().slice(0, 10);
  return sha256(`${env.SESSION_SECRET}:${day}`);
}

export function hashIp(ip: string | null | undefined): string {
  if (!ip) return sha256(`anon:${dailySalt()}`);
  return sha256(`${ip}:${dailySalt()}`);
}
