// IP → language detection using ip-api.com (free, no key required)
// Country code → primary language mapping

const COUNTRY_TO_LANGUAGE: Record<string, { name: string; code: string }> = {
  DE: { name: "German", code: "de" },
  AT: { name: "German", code: "de" },
  CH: { name: "German", code: "de" },
  FR: { name: "French", code: "fr" },
  BE: { name: "French", code: "fr" },
  ES: { name: "Spanish", code: "es" },
  MX: { name: "Spanish", code: "es" },
  AR: { name: "Spanish", code: "es" },
  CO: { name: "Spanish", code: "es" },
  CL: { name: "Spanish", code: "es" },
  PE: { name: "Spanish", code: "es" },
  VE: { name: "Spanish", code: "es" },
  IT: { name: "Italian", code: "it" },
  PT: { name: "Portuguese", code: "pt" },
  BR: { name: "Portuguese", code: "pt" },
  NL: { name: "Dutch", code: "nl" },
  RU: { name: "Russian", code: "ru" },
  UA: { name: "Ukrainian", code: "uk" },
  CN: { name: "Chinese", code: "zh" },
  TW: { name: "Chinese", code: "zh" },
  HK: { name: "Chinese", code: "zh" },
  JP: { name: "Japanese", code: "ja" },
  KR: { name: "Korean", code: "ko" },
  SA: { name: "Arabic", code: "ar" },
  AE: { name: "Arabic", code: "ar" },
  EG: { name: "Arabic", code: "ar" },
  MA: { name: "Arabic", code: "ar" },
  DZ: { name: "Arabic", code: "ar" },
  IQ: { name: "Arabic", code: "ar" },
  TR: { name: "Turkish", code: "tr" },
  PL: { name: "Polish", code: "pl" },
  SE: { name: "Swedish", code: "sv" },
  NO: { name: "Norwegian", code: "nb" },
  DK: { name: "Danish", code: "da" },
  FI: { name: "Finnish", code: "fi" },
  GR: { name: "Greek", code: "el" },
  CZ: { name: "Czech", code: "cs" },
  HU: { name: "Hungarian", code: "hu" },
  RO: { name: "Romanian", code: "ro" },
  BG: { name: "Bulgarian", code: "bg" },
  HR: { name: "Croatian", code: "hr" },
  SK: { name: "Slovak", code: "sk" },
  SI: { name: "Slovenian", code: "sl" },
  RS: { name: "Serbian", code: "sr" },
  ID: { name: "Indonesian", code: "id" },
  MY: { name: "Malay", code: "ms" },
  TH: { name: "Thai", code: "th" },
  VN: { name: "Vietnamese", code: "vi" },
  HI: { name: "Hindi", code: "hi" },
  IN: { name: "Hindi", code: "hi" },
  IR: { name: "Persian", code: "fa" },
  IL: { name: "Hebrew", code: "he" },
  PK: { name: "Urdu", code: "ur" },
};

const DEFAULT_LOCALE = { name: "English", code: "en", country: "Unknown", countryCode: "US" };

// In-memory cache: ip → { locale, fetchedAt }
const cache = new Map<string, { locale: typeof DEFAULT_LOCALE; fetchedAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export interface DetectedLocale {
  name: string;
  code: string;
  country: string;
  countryCode: string;
}

export function extractIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return (ips?.split(",")[0]?.trim()) ?? req.socket.remoteAddress ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Non-blocking version: returns from cache immediately.
 * If the IP is not cached yet, fires an async lookup to populate it for the next request.
 * Falls back to DEFAULT_LOCALE (English) so callers are never blocked.
 */
export function getLocaleFromIpSync(ip: string): DetectedLocale {
  if (!ip || ip === "unknown" || ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return DEFAULT_LOCALE;
  }
  const cached = cache.get(ip);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.locale;
  }
  // Not in cache — fire background fetch so the next request is instant
  getLocaleFromIp(ip).catch(() => {});
  return DEFAULT_LOCALE;
}

export async function getLocaleFromIp(ip: string): Promise<DetectedLocale> {
  // Skip for localhost/private IPs
  if (!ip || ip === "unknown" || ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return DEFAULT_LOCALE;
  }

  const cached = cache.get(ip);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.locale;
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return DEFAULT_LOCALE;
    const data = await res.json() as { status: string; country: string; countryCode: string };
    if (data.status !== "success") return DEFAULT_LOCALE;

    const lang = COUNTRY_TO_LANGUAGE[data.countryCode] ?? { name: "English", code: "en" };
    const locale: DetectedLocale = {
      name: lang.name,
      code: lang.code,
      country: data.country,
      countryCode: data.countryCode,
    };

    cache.set(ip, { locale, fetchedAt: Date.now() });
    return locale;
  } catch {
    return DEFAULT_LOCALE;
  }
}
