// Shared popup helpers — types, defaults, and (de)serialization used by both
// the admin builder routes and the public storefront capture endpoint.

export type PopupFormat = 'email' | 'sms' | 'email_sms' | 'spin_to_win';
export type PopupTrigger = 'time' | 'scroll' | 'exit_intent';
export type TargetPages = 'all' | 'home' | 'product' | 'collection' | 'cart';
export type TargetDevice = 'all' | 'desktop' | 'mobile';
export type TargetAudience = 'all' | 'new' | 'returning';

export interface WheelSegment {
  label: string;
  discountCode: string;
  /** Relative probability weight. Higher = more likely to land. */
  weight: number;
  color: string;
}

export const FORMAT_LABELS: Record<PopupFormat, string> = {
  email: 'Email capture',
  sms: 'SMS capture',
  email_sms: 'Email + SMS',
  spin_to_win: 'Spin to win',
};

export const TRIGGER_LABELS: Record<PopupTrigger, string> = {
  time: 'After a delay',
  scroll: 'On scroll depth',
  exit_intent: 'On exit intent',
};

export const DEFAULT_WHEEL: WheelSegment[] = [
  { label: '10% off', discountCode: 'SPIN10', weight: 30, color: '#7c5cff' },
  { label: '15% off', discountCode: 'SPIN15', weight: 20, color: '#9277ff' },
  { label: 'Free shipping', discountCode: 'FREESHIP', weight: 20, color: '#5b3df0' },
  { label: '5% off', discountCode: 'SPIN5', weight: 25, color: '#34d399' },
  { label: 'No luck', discountCode: '', weight: 5, color: '#2a2a35' },
];

/** Parse the serialized wheel JSON, falling back to an empty list. */
export function parseWheel(raw: string | null | undefined): WheelSegment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is WheelSegment => s && typeof s.label === 'string')
      .map((s) => ({
        label: String(s.label),
        discountCode: String(s.discountCode ?? ''),
        weight: Number.isFinite(s.weight) ? Math.max(0, Number(s.weight)) : 1,
        color: String(s.color ?? '#7c5cff'),
      }));
  } catch {
    return [];
  }
}

/** Whether this format needs at least one of email/phone at capture time. */
export function collectsEmail(format: string): boolean {
  return format === 'email' || format === 'email_sms' || format === 'spin_to_win';
}

export function collectsPhone(format: string): boolean {
  return format === 'sms' || format === 'email_sms';
}

/** Basic, dependency-free validation used on the public capture endpoint. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  // E.164-ish: optional +, 7–15 digits.
  return /^\+?[0-9]{7,15}$/.test(value.replace(/[\s()-]/g, ''));
}

/** Conversion rate as a 0–100 number, guarding divide-by-zero. */
export function conversionRate(conversions: number, impressions: number): number {
  if (impressions <= 0) return 0;
  return Math.round((conversions / impressions) * 1000) / 10;
}
