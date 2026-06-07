import { fetch } from "expo/fetch";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

export interface DetectedLocale {
  name: string;
  code: string;
  country: string;
  countryCode: string;
}

interface LocaleContextValue {
  detectedLocale: DetectedLocale | null;
  overrideLanguage: string | null;
  activeLanguage: string;
  activeLanguageCode: string;
  setOverrideLanguage: (name: string | null) => void;
  isLoading: boolean;
}

const DEFAULT_LOCALE: DetectedLocale = { name: "English", code: "en", country: "Unknown", countryCode: "US" };

const LocaleContext = createContext<LocaleContextValue>({
  detectedLocale: null,
  overrideLanguage: null,
  activeLanguage: "English",
  activeLanguageCode: "en",
  setOverrideLanguage: () => {},
  isLoading: true,
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [detectedLocale, setDetectedLocale] = useState<DetectedLocale | null>(null);
  const [overrideLanguage, setOverrideLanguageState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BASE}/emma/locale`);
        if (res.ok) {
          const data = await res.json() as DetectedLocale;
          setDetectedLocale(data);
        } else {
          setDetectedLocale(DEFAULT_LOCALE);
        }
      } catch {
        setDetectedLocale(DEFAULT_LOCALE);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setOverrideLanguage = useCallback((name: string | null) => {
    setOverrideLanguageState(name);
  }, []);

  const activeLanguage = overrideLanguage ?? detectedLocale?.name ?? "English";
  const activeLanguageCode = overrideLanguage
    ? (LANGUAGE_CODES[overrideLanguage] ?? "en")
    : (detectedLocale?.code ?? "en");

  return (
    <LocaleContext.Provider value={{
      detectedLocale, overrideLanguage, activeLanguage, activeLanguageCode,
      setOverrideLanguage, isLoading,
    }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export const SUPPORTED_LANGUAGES: { name: string; code: string; flag: string }[] = [
  { name: "English", code: "en", flag: "🇬🇧" },
  { name: "German", code: "de", flag: "🇩🇪" },
  { name: "French", code: "fr", flag: "🇫🇷" },
  { name: "Spanish", code: "es", flag: "🇪🇸" },
  { name: "Italian", code: "it", flag: "🇮🇹" },
  { name: "Portuguese", code: "pt", flag: "🇧🇷" },
  { name: "Dutch", code: "nl", flag: "🇳🇱" },
  { name: "Russian", code: "ru", flag: "🇷🇺" },
  { name: "Chinese", code: "zh", flag: "🇨🇳" },
  { name: "Japanese", code: "ja", flag: "🇯🇵" },
  { name: "Korean", code: "ko", flag: "🇰🇷" },
  { name: "Arabic", code: "ar", flag: "🇸🇦" },
  { name: "Turkish", code: "tr", flag: "🇹🇷" },
  { name: "Polish", code: "pl", flag: "🇵🇱" },
  { name: "Swedish", code: "sv", flag: "🇸🇪" },
  { name: "Norwegian", code: "nb", flag: "🇳🇴" },
  { name: "Danish", code: "da", flag: "🇩🇰" },
  { name: "Finnish", code: "fi", flag: "🇫🇮" },
  { name: "Greek", code: "el", flag: "🇬🇷" },
  { name: "Ukrainian", code: "uk", flag: "🇺🇦" },
  { name: "Hindi", code: "hi", flag: "🇮🇳" },
  { name: "Indonesian", code: "id", flag: "🇮🇩" },
  { name: "Vietnamese", code: "vi", flag: "🇻🇳" },
];

const LANGUAGE_CODES: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [l.name, l.code])
);
