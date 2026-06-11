// Smart per-customer notification timing.
//
// Looks up a recipient's IANA timezone from their billing/shipping country
// code (ISO 3166-1 alpha-2). If their local time falls inside the send window
// (default 06:00-22:00) the alert fires immediately; otherwise it's queued
// until 10:00 local the next day.
//
// The country map is embedded - no external API call. For multi-tz countries
// we pick the most-populated reasonable default. Better-known timezones from
// the customer's address (if Shopify ever exposes them) should override.

export const SEND_WINDOW_START_HOUR = 6;
export const SEND_WINDOW_END_HOUR = 22; // 22:00 = 10pm
export const NEXT_MORNING_HOUR = 10;

// ISO 3166-1 alpha-2 -> IANA timezone (one default per country).
const COUNTRY_TZ: Record<string, string> = {
  US: 'America/New_York',
  CA: 'America/Toronto',
  MX: 'America/Mexico_City',
  BR: 'America/Sao_Paulo',
  AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago',
  CO: 'America/Bogota',
  PE: 'America/Lima',
  GB: 'Europe/London',
  IE: 'Europe/Dublin',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  ES: 'Europe/Madrid',
  PT: 'Europe/Lisbon',
  IT: 'Europe/Rome',
  NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels',
  CH: 'Europe/Zurich',
  AT: 'Europe/Vienna',
  SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo',
  DK: 'Europe/Copenhagen',
  FI: 'Europe/Helsinki',
  PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague',
  HU: 'Europe/Budapest',
  RO: 'Europe/Bucharest',
  GR: 'Europe/Athens',
  TR: 'Europe/Istanbul',
  RU: 'Europe/Moscow',
  UA: 'Europe/Kyiv',
  IS: 'Atlantic/Reykjavik',
  ZA: 'Africa/Johannesburg',
  NG: 'Africa/Lagos',
  EG: 'Africa/Cairo',
  KE: 'Africa/Nairobi',
  MA: 'Africa/Casablanca',
  IL: 'Asia/Jerusalem',
  AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh',
  IN: 'Asia/Kolkata',
  PK: 'Asia/Karachi',
  BD: 'Asia/Dhaka',
  TH: 'Asia/Bangkok',
  VN: 'Asia/Ho_Chi_Minh',
  ID: 'Asia/Jakarta',
  MY: 'Asia/Kuala_Lumpur',
  SG: 'Asia/Singapore',
  PH: 'Asia/Manila',
  HK: 'Asia/Hong_Kong',
  TW: 'Asia/Taipei',
  CN: 'Asia/Shanghai',
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland',
};

export function timezoneForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return 'UTC';
  const tz = COUNTRY_TZ[countryCode.toUpperCase()];
  return tz ?? 'UTC';
}

// Returns the local hour (0-23) for a given UTC instant in a given IANA tz.
// Uses Intl.DateTimeFormat - bundled with node, no extra dep.
export function localHourIn(timezone: string, when: Date = new Date()): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const parts = fmt.formatToParts(when);
    const hourPart = parts.find((p) => p.type === 'hour');
    if (!hourPart) return when.getUTCHours();
    const h = parseInt(hourPart.value, 10);
    // Intl can emit "24" for midnight in some locales - normalize.
    return Number.isFinite(h) ? h % 24 : when.getUTCHours();
  } catch {
    return when.getUTCHours();
  }
}

export type SmartDecision = {
  sendNow: boolean;
  // Only set when sendNow=false: the UTC instant the alert becomes eligible.
  dueAt?: Date;
  timezone: string;
  localHour: number;
};

// Core rule: if local time is in [START, END) fire now; else queue for
// NEXT_MORNING_HOUR local.
export function decideSendTime(
  countryCode: string | null | undefined,
  now: Date = new Date(),
): SmartDecision {
  const timezone = timezoneForCountry(countryCode);
  const localHour = localHourIn(timezone, now);

  if (localHour >= SEND_WINDOW_START_HOUR && localHour < SEND_WINDOW_END_HOUR) {
    return { sendNow: true, timezone, localHour };
  }

  // Queue: figure out the UTC instant that maps to NEXT_MORNING_HOUR local.
  // Approach: walk forward in 30-minute steps (max 48h) until local hour
  // matches. Avoids tz-math libs and handles DST transitions cleanly.
  const stepMs = 30 * 60 * 1000;
  const maxSteps = 48 * 2;
  let candidate = new Date(now.getTime());
  for (let i = 0; i < maxSteps; i++) {
    candidate = new Date(candidate.getTime() + stepMs);
    if (localHourIn(timezone, candidate) === NEXT_MORNING_HOUR) {
      return { sendNow: false, dueAt: candidate, timezone, localHour };
    }
  }
  // Fallback: 12h from now.
  return {
    sendNow: false,
    dueAt: new Date(now.getTime() + 12 * 60 * 60 * 1000),
    timezone,
    localHour,
  };
}
