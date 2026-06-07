import {
  speechToTextWithLanguage,
} from "@workspace/integrations-openai-ai-server/audio";
import { Router } from "express";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { searchAndFetch } from "./search";
import { parseDeepLinkIntent, formatDeepLinkContext } from "./deeplinks";
import { extractIp, getLocaleFromIp } from "./locale";
import presentationRouter from "./presentation";
import deepResearchRouter from "./deep-research";

const router = Router();

// ── Language → Edge TTS neural voice map (120+ languages) ────────────────────
// detectLanguageFromText() returns ISO 639-1 codes; map to best neural voice.
// Fallback: if a language has no Edge TTS voice, "default" (English) is used.
const LANG_TO_VOICE: Record<string, string> = {
  // English
  en: "en-US-EmmaNeural",
  // Romance
  fr: "fr-FR-DeniseNeural",
  es: "es-ES-ElviraNeural",
  pt: "pt-BR-FranciscaNeural",
  it: "it-IT-ElsaNeural",
  ca: "ca-ES-JoanaNeural",
  gl: "gl-ES-SabelaNeural",
  ro: "ro-RO-AlinaNeural",
  // Germanic
  de: "de-DE-KatjaNeural",
  nl: "nl-NL-FennaNeural",
  sv: "sv-SE-SofieNeural",
  da: "da-DK-ChristelNeural",
  nb: "nb-NO-PernilleNeural",
  nn: "nb-NO-PernilleNeural", // Nynorsk → same voice
  no: "nb-NO-PernilleNeural",
  fi: "fi-FI-NooraNeural",
  is: "is-IS-GudrunNeural",
  af: "af-ZA-AdriNeural",
  // Slavic
  ru: "ru-RU-SvetlanaNeural",
  pl: "pl-PL-ZofiaNeural",
  cs: "cs-CZ-VlastaNeural",
  sk: "sk-SK-ViktoriaNeural",
  bg: "bg-BG-KalinaNeural",
  uk: "uk-UA-PolinaNeural",
  be: "ru-RU-SvetlanaNeural", // Belarusian → Russian fallback
  hr: "hr-HR-GabrijelaNeural",
  sl: "sl-SI-PetraNeural",
  sr: "sr-RS-SophieNeural",
  bs: "bs-BA-VesnaNeural",
  mk: "mk-MK-MarijaNeural",
  // Baltic
  lt: "lt-LT-OnaNeural",
  lv: "lv-LV-EveritaNeural",
  et: "et-EE-AnuNeural",
  // Celtic / other European
  ga: "ga-IE-OrlaNeural",
  cy: "cy-GB-NiaNeural",
  mt: "mt-MT-GraceNeural",
  eu: "eu-ES-AinhoaNeural",
  sq: "sq-AL-AnilaNeural",
  el: "el-GR-AthinaNeural",
  hu: "hu-HU-NoemiNeural",
  tr: "tr-TR-EmelNeural",
  ht: "fr-FR-DeniseNeural", // Haitian Creole → French voice (closest phonology)
  eo: "en-US-EmmaNeural",   // Esperanto → English voice fallback
  // Semitic / Middle East
  ar: "ar-SA-ZariyahNeural",
  he: "he-IL-HilaNeural",
  fa: "fa-IR-DilaraNeural",
  ur: "ur-PK-UzmaNeural",
  // South Asian
  hi: "hi-IN-SwaraNeural",
  bn: "bn-BD-NabanitaNeural",
  ta: "ta-IN-PallaviNeural",
  te: "te-IN-ShrutiNeural",
  ml: "ml-IN-SobhanaNeural",
  gu: "gu-IN-DhwaniNeural",
  kn: "kn-IN-SapnaNeural",
  or: "or-IN-SubhasiniNeural",
  mr: "mr-IN-AarohiNeural",
  pa: "pa-IN-OjasveeNeural",
  ne: "ne-NP-HemkalaNeural",
  si: "si-LK-ThiliniNeural",
  // East Asian
  zh: "zh-CN-XiaoxiaoNeural",
  ja: "ja-JP-NanamiNeural",
  ko: "ko-KR-SunHiNeural",
  mn: "mn-MN-YesüiNeural",
  bo: "zh-CN-XiaoxiaoNeural", // Tibetan → Chinese voice fallback
  // Southeast Asian
  id: "id-ID-GadisNeural",
  ms: "ms-MY-YasminNeural",
  th: "th-TH-PremwadeeNeural",
  vi: "vi-VN-HoaiMyNeural",
  fil: "fil-PH-BlessicaNeural",
  tl: "fil-PH-BlessicaNeural",
  my: "my-MM-NilarNeural",
  km: "km-KH-SreymomNeural",
  lo: "lo-LA-KeomanyNeural",
  jv: "jv-ID-SitiNeural",
  su: "su-ID-TutiNeural",
  // Caucasian
  ka: "ka-GE-EkaNeural",
  hy: "hy-AM-AnahitNeural",
  // Central Asian / Turkic
  az: "az-AZ-BanuNeural",
  kk: "kk-KZ-AigulNeural",
  uz: "uz-UZ-MadinaNeural",
  ky: "tr-TR-EmelNeural", // Kyrgyz → Turkish voice (closest available)
  tk: "tr-TR-EmelNeural", // Turkmen → Turkish voice
  // African
  sw: "sw-KE-ZuriNeural",
  am: "am-ET-MekdesNeural",
  zu: "zu-ZA-ThandoNeural",
  st: "af-ZA-AdriNeural",   // Sesotho → Afrikaans voice (closest available)
  // Fallback
  default: "en-US-EmmaNeural",
};

function voiceForLang(lang: string): string {
  return LANG_TO_VOICE[lang] ?? LANG_TO_VOICE["default"]!;
}

// ── TTS: fresh instance per request (avoids stale WebSocket issues) ───────────
async function createEdgeTTS(voiceName: string): Promise<MsEdgeTTS> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  return tts;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.post("/transcribe", async (req, res) => {
  const { audio, format = "m4a" } = req.body as {
    audio: string;
    format?: string;
  };

  if (!audio) {
    res.status(400).json({ error: "audio is required" });
    return;
  }

  try {
    const buffer = Buffer.from(audio, "base64");
    const { text, language } = await speechToTextWithLanguage(buffer, format as any);
    res.json({ transcript: text, language });
  } catch (err) {
    req.log.error({ err }, "transcription failed");
    res.status(500).json({ error: "Transcription failed" });
  }
});

router.post("/speak", async (req, res) => {
  const { text, language = "en" } = req.body as { text: string; language?: string };

  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const voiceName = voiceForLang(language.toLowerCase());

  try {
    const tts = await createEdgeTTS(voiceName);
    const chunks: Buffer[] = [];
    const { audioStream } = tts.toStream(text.slice(0, 800)) as any;
    await new Promise<void>((resolve, reject) => {
      audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      audioStream.on("end", resolve);
      audioStream.on("error", reject);
    });
    const audio = Buffer.concat(chunks).toString("base64");
    res.json({ audio, voice: voiceName });
  } catch (err) {
    req.log.error({ err, voiceName }, "Edge TTS failed");
    // Retry once with English fallback voice
    if (voiceName !== LANG_TO_VOICE["default"]) {
      try {
        const fallback = await createEdgeTTS(LANG_TO_VOICE["default"]!);
        const chunks: Buffer[] = [];
        const { audioStream } = fallback.toStream(text.slice(0, 800)) as any;
        await new Promise<void>((resolve, reject) => {
          audioStream.on("data", (c: Buffer) => chunks.push(c));
          audioStream.on("end", resolve);
          audioStream.on("error", reject);
        });
        res.json({ audio: Buffer.concat(chunks).toString("base64"), voice: LANG_TO_VOICE["default"] });
        return;
      } catch { /* fall through */ }
    }
    res.status(500).json({ error: "Speech synthesis failed" });
    return;
  }
});

router.post("/search", async (req, res) => {
  const { query, maxResults = 5 } = req.body as {
    query: string;
    maxResults?: number;
  };

  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  try {
    const { results, pages } = await searchAndFetch(query, maxResults, 2);
    res.json({ results, pages });
  } catch (err) {
    req.log.error({ err }, "search failed");
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/locale", async (req, res) => {
  const ip = extractIp(req);
  const locale = await getLocaleFromIp(ip);
  res.json(locale);
});

router.post("/deeplink", async (req, res) => {
  const { text } = req.body as { text: string };

  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const result = parseDeepLinkIntent(text);
  if (!result) {
    res.status(404).json({ error: "No app intent detected" });
    return;
  }

  res.json(result);
});

router.use(presentationRouter);
router.use(deepResearchRouter);

export { searchAndFetch, parseDeepLinkIntent, formatDeepLinkContext };
export default router;
