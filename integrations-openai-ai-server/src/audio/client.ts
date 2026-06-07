import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";
import { spawn } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";

if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI AI integration?",
  );
}

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type AudioFormat = "wav" | "mp3" | "webm" | "mp4" | "ogg" | "unknown";

/**
 * Detect audio format from buffer magic bytes.
 * Supports: WAV, MP3, WebM (Chrome/Firefox), MP4/M4A/MOV (Safari/iOS), OGG
 */
export function detectAudioFormat(buffer: Buffer): AudioFormat {
  if (buffer.length < 12) return "unknown";

  // WAV: RIFF....WAVE
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return "wav";
  }
  // WebM: EBML header
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "webm";
  }
  // MP3: ID3 tag or frame sync
  if (
    (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xfa || buffer[1] === 0xf3)) ||
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
  ) {
    return "mp3";
  }
  // MP4/M4A/MOV: ....ftyp (Safari/iOS records in these containers)
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "mp4";
  }
  // OGG: OggS
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return "ogg";
  }
  return "unknown";
}

/**
 * Convert any audio/video format to WAV using ffmpeg.
 */
export async function convertToWav(audioBuffer: Buffer): Promise<Buffer> {
  const inputPath = join(tmpdir(), `input-${randomUUID()}`);
  const outputPath = join(tmpdir(), `output-${randomUUID()}.wav`);

  try {
    await writeFile(inputPath, audioBuffer);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", inputPath,
        "-vn",
        "-f", "wav",
        "-ar", "16000",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        "-y",
        outputPath,
      ]);

      ffmpeg.stderr.on("data", () => {});
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Auto-detect and convert audio to OpenAI-compatible format.
 */
export async function ensureCompatibleFormat(
  audioBuffer: Buffer
): Promise<{ buffer: Buffer; format: "wav" | "mp3" }> {
  const detected = detectAudioFormat(audioBuffer);
  if (detected === "wav") return { buffer: audioBuffer, format: "wav" };
  if (detected === "mp3") return { buffer: audioBuffer, format: "mp3" };
  const wavBuffer = await convertToWav(audioBuffer);
  return { buffer: wavBuffer, format: "wav" };
}

/** Voice Chat: audio-in, audio-out using gpt-audio. */
export async function voiceChat(
  audioBuffer: Buffer,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  inputFormat: "wav" | "mp3" = "wav",
  outputFormat: "wav" | "mp3" = "mp3"
): Promise<{ transcript: string; audioResponse: Buffer }> {
  const audioBase64 = audioBuffer.toString("base64");
  const response = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: outputFormat },
    messages: [{
      role: "user",
      content: [
        { type: "input_audio", input_audio: { data: audioBase64, format: inputFormat } },
      ],
    }],
  });
  const message = response.choices[0]?.message as any;
  const transcript = message?.audio?.transcript || message?.content || "";
  const audioData = message?.audio?.data ?? "";
  return {
    transcript,
    audioResponse: Buffer.from(audioData, "base64"),
  };
}

/** Streaming Voice Chat for real-time audio responses. */
export async function voiceChatStream(
  audioBuffer: Buffer,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  inputFormat: "wav" | "mp3" = "wav"
): Promise<AsyncIterable<{ type: "transcript" | "audio"; data: string }>> {
  const audioBase64 = audioBuffer.toString("base64");
  const stream = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: "pcm16" },
    messages: [{
      role: "user",
      content: [
        { type: "input_audio", input_audio: { data: audioBase64, format: inputFormat } },
      ],
    }],
    stream: true,
  });

  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as any;
      if (!delta) continue;
      if (delta?.audio?.transcript) {
        yield { type: "transcript", data: delta.audio.transcript };
      }
      if (delta?.audio?.data) {
        yield { type: "audio", data: delta.audio.data };
      }
    }
  })();
}

/** Text-to-Speech using gpt-audio. */
export async function textToSpeech(
  text: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  format: "wav" | "mp3" | "flac" | "opus" | "pcm16" = "wav"
): Promise<Buffer> {
  const response = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format },
    messages: [
      { role: "system", content: "You are an assistant that performs text-to-speech." },
      { role: "user", content: `Repeat the following text verbatim: ${text}` },
    ],
  });
  const audioData = (response.choices[0]?.message as any)?.audio?.data ?? "";
  return Buffer.from(audioData, "base64");
}

/** Streaming Text-to-Speech. */
export async function textToSpeechStream(
  text: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy"
): Promise<AsyncIterable<string>> {
  const stream = await openai.chat.completions.create({
    model: "gpt-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: "pcm16" },
    messages: [
      { role: "system", content: "You are an assistant that performs text-to-speech." },
      { role: "user", content: `Repeat the following text verbatim: ${text}` },
    ],
    stream: true,
  });

  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta as any;
      if (!delta) continue;
      if (delta?.audio?.data) {
        yield delta.audio.data;
      }
    }
  })();
}

/** Speech-to-Text using gpt-4o-mini-transcribe. */
export async function speechToText(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm" = "wav"
): Promise<string> {
  const file = await toFile(audioBuffer, `audio.${format}`);
  const response = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
  });
  return response.text;
}

/**
 * Speech-to-Text with language detection.
 * Uses json format (the only format supported by gpt-4o-mini-transcribe),
 * then detects language from the transcript text.
 */
export async function speechToTextWithLanguage(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm" = "wav"
): Promise<{ text: string; language: string }> {
  const text = await speechToText(audioBuffer, format);
  return { text, language: detectLanguageFromText(text) };
}

/**
 * Comprehensive language detection covering 100+ languages.
 *
 * Three-tier strategy (each tier kicks in only if the previous tiers didn't match):
 *   Tier 1 – Unicode script ranges  : 1 character is enough (non-Latin scripts)
 *   Tier 2 – Distinctive accents    : 1 word is enough (Latin scripts with unique chars)
 *   Tier 3 – Word-frequency lists   : adaptive threshold — short texts need fewer hits
 */
export function detectLanguageFromText(text: string): string {
  if (!text.trim()) return "en";
  const t = text.toLowerCase();

  // ── TIER 1: Unicode script ranges ─────────────────────────────────────────
  if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(t)) return "zh";
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(t)) return "ja";
  if (/[\uac00-\ud7af\ua960-\ua97f\ud7b0-\ud7ff]/.test(t)) return "ko";

  // Arabic-family (test before Cyrillic — Farsi/Urdu share Arabic script)
  if (/[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/.test(t)) {
    if (/\b(که|و|در|به|از|این|است|با|می|یک|برای|کن|هم|هر|خود)\b/.test(t)) return "fa";
    if (/\b(کا|کے|کی|ہے|نے|میں|سے|پر|کو|ہیں|ہوں|گا|گی|گے)\b/.test(t)) return "ur";
    return "ar";
  }
  if (/[\u0590-\u05ff\ufb1d-\ufb4f]/.test(t)) return "he";

  // South Asian scripts (order matters — ranges must not overlap)
  if (/[\u0900-\u097f]/.test(t)) return "hi";  // Devanagari → Hindi / Marathi / Nepali
  if (/[\u0980-\u09ff]/.test(t)) return "bn";  // Bengali / Assamese
  if (/[\u0a00-\u0a7f]/.test(t)) return "pa";  // Gurmukhi → Punjabi
  if (/[\u0a80-\u0aff]/.test(t)) return "gu";  // Gujarati
  if (/[\u0b00-\u0b7f]/.test(t)) return "or";  // Odia
  if (/[\u0b80-\u0bff]/.test(t)) return "ta";  // Tamil
  if (/[\u0c00-\u0c7f]/.test(t)) return "te";  // Telugu
  if (/[\u0c80-\u0cff]/.test(t)) return "kn";  // Kannada
  if (/[\u0d00-\u0d7f]/.test(t)) return "ml";  // Malayalam
  if (/[\u0d80-\u0dff]/.test(t)) return "si";  // Sinhala

  // Cyrillic — word-patterns distinguish Slavic/Turkic languages
  if (/[\u0400-\u04ff]/.test(t)) {
    if (/\b(і|в|не|що|як|це|та|або|але|він|вона|ми|ви|є|для|про|при)\b/.test(t)) return "uk";
    if (/\b(и|в|не|на|с|что|как|это|по|но|он|она|мы|вы|есть|для)\b/.test(t)) return "ru";
    if (/\b(е|да|се|во|за|на|не|со|тоа|кои|ние|вие|тие|нив)\b/.test(t)) return "mk";
    if (/\b(и|е|да|не|за|на|се|от|го|ги|му|или|това|тя|ще)\b/.test(t)) return "bg";
    if (/\b(і|у|не|на|з|як|гэта|але|мы|вы|ён|яна|яны)\b/.test(t)) return "be";
    if (/\b(байна|юм|бол|гэж|энэ|тэр|бид|та|би|тийм|үгүй)\b/.test(t)) return "mn";
    if (/\b(және|бар|бұл|болып|ол|бол|үшін|жоқ|мен|сен|біз)\b/.test(t)) return "kk";
    if (/\b(ва|бу|бир|учун|билан|эди|ман|сен|биз|улар|нима)\b/.test(t)) return "uz";
    if (/\b(и|је|да|се|у|за|на|не|са|то|али|ми|ви|они|није)\b/.test(t)) return "sr";
    return "ru"; // default Cyrillic
  }

  // Other non-Latin scripts
  if (/[\u0370-\u03ff]/.test(t)) return "el";            // Greek
  if (/[\u0530-\u058f\ufb13-\ufb17]/.test(t)) return "hy"; // Armenian
  if (/[\u10a0-\u10ff]/.test(t)) return "ka";            // Georgian
  if (/[\u1200-\u137f\u1380-\u139f\u2d80-\u2ddf]/.test(t)) return "am"; // Ethiopic → Amharic
  if (/[\u0e00-\u0e7f]/.test(t)) return "th";            // Thai
  if (/[\u0e80-\u0eff]/.test(t)) return "lo";            // Lao
  if (/[\u1000-\u109f\ua9e0-\ua9ff\ua9e0-\ua9ef]/.test(t)) return "my"; // Myanmar
  if (/[\u1780-\u17ff]/.test(t)) return "km";            // Khmer
  if (/[\u0f00-\u0fff]/.test(t)) return "bo";            // Tibetan
  if (/[\u1800-\u18af]/.test(t)) return "mn";            // Traditional Mongolian

  // ── TIER 2: Distinctive Latin accent characters ───────────────────────────

  // Vietnamese: tonal stack diacritics + đ/ơ/ư are completely unique
  if (/[đơưắặằẳẵẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/.test(t)) return "vi";

  // Icelandic: ð and þ only exist in Icelandic among living languages
  if (/[ðþ]/.test(t)) return "is";

  // Maltese: ħ and ġ are unique to Maltese
  if (/[ħġ]/.test(t)) return "mt";

  // Welsh: ŵ and ŷ are unique to Welsh orthography
  if (/[ŵŷ]/.test(t)) return "cy";

  // German: ä/ö/ü/ß — distinguish from Swedish which uses ä/ö but not ü/ß
  if (/[äöüß]/.test(t)) {
    if (/[üß]/.test(t)) return "de";
    if (/[å]/.test(t)) return "sv";
    if (/\b(und|ich|nicht|das|der|die|ein|ist|mit|sie|wir|danke|bitte|guten|ja|nein|hallo)\b/.test(t)) return "de";
    if (/\b(och|att|det|är|ett|som|på|med|för|tack|ja|nej|hej)\b/.test(t)) return "sv";
    return "de";
  }

  // Nordic: å/ø/æ
  if (/[åøæ]/.test(t)) {
    if (/[ø]/.test(t)) {
      if (/\b(og|er|ikke|han|hun|de|vi|på|av|til|takk|ja|nei|hei|hva)\b/.test(t)) return "nb";
      return "da";
    }
    return "sv"; // å without ø → Swedish
  }

  // Estonian: õ (not caught by Nordic check above)
  if (/[õ]/.test(t)) return "et";

  // Latvian: elongated vowels ā/ē + unique consonants ģ/ķ/ļ/ņ
  if (/[āēģķļņ]/.test(t)) return "lv";

  // Lithuanian: ė and ų are unique to Lithuanian
  if (/[ėų]/.test(t)) return "lt";

  // Croatian/Bosnian: ć or đ without German umlauts
  if (/[ćđ]/.test(t) && !/[äöü]/.test(t)) return "hr";

  // Albanian: ë without German context (ä/ö/ü already caught)
  if (/[ë]/.test(t) && !/[äö]/.test(t)) return "sq";

  // French: ç, â, ê, î, ô, û, œ (and à/è when combined with any of these)
  if (/[àâçéèêëîïôùûœ]/.test(t)) {
    if (/[ãõ]/.test(t)) return "pt"; // Portuguese ã/õ overrides
    return "fr";
  }

  // Portuguese: ã/õ not used in French or Spanish
  if (/[ãõ]/.test(t)) return "pt";

  // Spanish: ñ, ¡, ¿
  if (/[ñ¡¿]/.test(t)) return "es";

  // Polish: ł is extremely distinctive; ą/ę/ń/ś/ź/ż/ć also unique
  if (/[łąęńśźżć]/.test(t)) return "pl";

  // Czech: ř is exclusively Czech; other chars shared with Slovak
  if (/[čšžřďťň]/.test(t)) {
    if (/[ř]/.test(t)) return "cs";
    if (/\b(a|je|to|na|ne|v|do|ale|co|jak|ten|se|byl|ano|také|nebo)\b/.test(t)) return "cs";
    return "sk";
  }

  // Romanian: ă/ș/ț
  if (/[ăîâșț]/.test(t)) return "ro";

  // Hungarian: ő/ű are unique to Hungarian
  if (/[őű]/.test(t)) return "hu";

  // Turkish: dotless-ı, ğ, ş
  if (/[ığş]/.test(t)) {
    if (/[əü]/.test(t) && /\b(bu|bir|var|çox|mən|sən|biz|siz|yox|ola)\b/.test(t)) return "az";
    return "tr";
  }

  // Catalan: l·l (unique ligature)
  if (/l·l/.test(t)) return "ca";

  // ── TIER 3: Word-frequency matching (adaptive threshold) ──────────────────
  // Threshold: 1 match for ≤3 words, 2 for 4–8 words, 3 for longer texts
  const words = (t.match(/\b[a-zàáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿœßąćęłńśźżčšžćđőűığş]+\b/g) || []);
  const w = new Set(words);
  const needed = words.length <= 3 ? 1 : words.length <= 8 ? 2 : 3;
  const hit = (m: string[]) => m.filter(x => w.has(x)).length >= needed;

  // Romance languages
  if (hit(["le","la","les","du","de","et","est","un","une","je","tu","vous","nous","pas","que","ils","elle","son","bien","oui","non","merci","bonjour","comment","salut","aussi","mais","avec","dans","sur","tout","comme","plus","très","avoir","être","faire","moi","toi","lui","suis","avez","allons","pourquoi","encore","déjà","toujours","jamais","souvent","parfois"])) return "fr";
  if (hit(["el","la","los","las","es","que","un","una","en","con","se","por","como","no","pero","yo","mi","tu","su","hola","gracias","bien","esto","está","para","más","muy","todo","este","cuando","donde","desde","ser","tener","hacer","vamos","quiero","tienes","estoy","bueno","malo","aquí","allá","cómo","qué","porque","también","nunca","siempre"])) return "es";
  if (hit(["o","a","os","as","de","que","em","um","uma","com","para","se","não","mas","por","sim","isso","você","obrigado","como","bem","ser","ter","fazer","quando","onde","aqui","muito","também","ainda","já","sempre","nunca","depois","então","nosso","nossa","meu","minha","seu","sua","tudo","todos","todas","eles","elas"])) return "pt";
  if (hit(["il","lo","la","i","le","di","che","un","una","in","con","non","per","si","è","ho","mi","ci","se","ma","sì","no","bene","ciao","grazie","come","cosa","questo","questa","essere","avere","fare","andare","quando","dove","perché","ancora","già","sempre","mai","dopo","molto","tutto","mio","mia","tuo","tua","lui","lei","noi","voi","loro"])) return "it";
  if (hit(["i","de","la","el","les","dels","que","en","per","amb","tot","tots","però","també","quan","com","molt","més","sempre","mai","aquí","allà","on","qui","perquè","si","no","sí","ara","ja","doncs","tant","cada","aquest","aquesta","nosaltres","vosaltres","ells","elles","estic","ets","és","som","sou","són"])) return "ca";
  if (hit(["e","o","a","de","da","do","en","na","non","por","para","con","que","mais","pero","como","un","unha","tamén","hai","ten","ser","ter","ir","facer","xente","cando","onde","logo","sempre","nunca","moi","moito","todo","toda","agora","nós","vós","eles","elas","son","somos","sodes","son"])) return "gl";
  if (hit(["și","la","în","de","că","este","un","cu","dar","se","nu","pe","care","din","da","bine","mulțumesc","salut","cum","ce","când","unde","cine","mai","deja","acum","astăzi","mâine","ieri","acolo","acesta","noi","voi","ei","ele","eu","tu","el","ea","sunt","ești","suntem","sunteți"])) return "ro";

  // Germanic
  if (hit(["und","ich","nicht","das","der","die","ein","ist","mit","sie","wir","auf","zu","im","er","es","war","hat","für","dem","den","ja","nein","bitte","danke","guten","wie","was","noch","mehr","sehr","auch","aber","oder","wenn","dann","nur","alle","viel","kann","wird","haben","sein","uns","euch","ihr","du","hast","bist","sind","worden","hallo","morgen","abend","heute"])) return "de";
  if (hit(["de","het","een","van","in","is","dat","er","op","te","zijn","met","ze","hij","maar","dit","wel","ook","niet","ja","nee","goed","hoe","wat","dan","zo","nog","meer","veel","alle","kan","heeft","worden","hebben","waren","over","uit","naar","door","voor","ik","jij","wij","jullie","zij","mij","jou","hem","haar","ons","hallo","dag","goedemorgen","goedenavond"])) return "nl";
  if (hit(["och","att","det","är","en","ett","som","på","med","inte","av","för","till","han","hon","men","tack","ja","nej","god","hur","vad","om","från","efter","under","vid","mot","hos","sin","sitt","sina","dem","deras","vi","ni","de","mig","dig","oss","er","sig","hej","hejdå","jag","du","bra","okej","visst"])) return "sv";
  if (hit(["og","at","det","er","en","et","som","på","med","ikke","af","til","der","han","hun","men","tak","ja","nej","god","hvad","hvordan","fra","efter","under","over","ved","mod","hos","sin","sit","sine","dem","deres","vi","i","de","mig","dig","os","jer","sig","hej","farvel","jeg","du","godt","okay"])) return "da";
  if (hit(["og","at","det","er","en","et","som","på","med","ikke","av","til","han","hun","men","takk","ja","nei","bra","hva","hvordan","fra","etter","under","over","ved","mot","hos","sin","sitt","sine","dem","deres","vi","dere","de","meg","deg","oss","seg","hei","ha det","jeg","du","okay","godt"])) return "nb";
  if (hit(["og","er","ein","eit","som","på","med","ikkje","av","til","han","ho","men","takk","ja","nei","bra","kva","korleis","frå","etter","under","over","ved","mot","hos","sin","sitt","sine","dei","deira","vi","de","meg","deg","oss","dykk","seg","hei","eg","du","godt"])) return "nn";
  if (hit(["ja","on","ei","se","että","ne","mutta","niin","jo","vain","kuin","olla","hän","me","te","he","mitä","miksi","hyvä","kiitos","kun","jos","koska","vai","sekä","myös","vielä","nyt","sitten","siellä","täällä","moi","hei","anteeksi","minä","sinä","me","te","hän","olen","olet","olemme","olette","ovat"])) return "fi";
  if (hit(["ja","er","ekki","og","en","sem","á","með","af","til","hann","hún","en","takk","já","nei","gott","hvað","hvernig","frá","eftir","undir","yfir","við","gegn","hjá","þetta","þessi","hér","þar","ég","þú","hann","hún","við","þið","þeir","þær","þau","sæll","komdu","bless"])) return "is";

  // Celtic
  if (hit(["agus","i","an","ar","le","ní","go","do","nach","ach","mar","tá","bí","cad","conas","cén","seo","sin","mé","tú","sé","sí","muid","sibh","siad","orm","ort","air","orainn","anseo","ansin","raibh","maith","agat","dia","duit","slán"])) return "ga";
  if (hit(["ac","yn","y","yr","i","a","o","am","ar","at","dros","drwy","dan","heb","gan","neu","ond","pan","sut","ble","pwy","beth","pa","hefyd","dim","eto","yma","nhw","chi","hi","fo","fi","ni","fy","dy","ei","rwy","rwyt","mae","oedd","bydd","diolch","bore","da","prynhawn","nos","croeso","iawn"])) return "cy";

  // South Slavic (Latin)
  if (hit(["i","je","da","se","u","za","na","ne","sa","to","ali","mi","vi","oni","kako","što","koji","koje","koja","nije","ima","bio","bila","biti","hvala","molim","dobar","dan","noć","zdravo","bok","bog","drago","vidimo","bih","bismo","biste","bi","biti","imati","htjeti"])) return "hr";
  if (hit(["in","je","da","se","v","za","na","ne","s","to","ali","mi","vi","oni","kako","kaj","ki","kar","ni","ima","bil","bila","biti","hvala","prosim","dober","dan","noč","zdravo","živjo","adijo","drago","bi","bi","biti","imeti","hoteti"])) return "sl";
  if (hit(["i","je","da","se","u","za","na","ne","sa","to","ali","mi","vi","oni","kako","što","koji","koje","nije","ima","bio","bila","hvala","molim","dobar","dan","noć","zdravo","bok","drago"])) return "bs";

  // West Slavic
  if (hit(["a","je","se","to","na","ne","v","do","ale","co","jak","ten","byl","ano","také","když","nebo","protože","pokud","proto","tedy","ahoj","čau","dobrý","den","noc","díky","prosím","promiňte","nashledanou","vítejte","jsem","jsi","jsme","jste","jsou"])) return "cs";
  if (hit(["a","je","sa","to","na","nie","v","do","ale","čo","ako","ten","bol","áno","tiež","keď","alebo","pretože","ak","preto","teda","ahoj","čau","dobrý","deň","noc","ďakujem","prosím","prepáčte","dovidenia","vitajte","som","si","sme","ste","sú"])) return "sk";

  // Baltic
  if (hit(["ir","yra","ne","tai","su","už","į","iš","ant","po","be","tarp","per","dėl","prie","apie","kad","kai","bet","arba","tačiau","nes","jei","nors","vis","dar","jau","tik","labai","taip","kas","kur","kada","kodėl","kaip","labas","ačiū","prašom","atsiprašau","sudie","viso","gero","sveikas","laba","diena","esu","esi","esame","esate","yra"])) return "lt";
  if (hit(["un","ir","nav","es","tu","mēs","jūs","viņi","kas","kur","kad","kā","kāpēc","vai","bet","jo","tāpēc","taču","arī","jau","vēl","tikai","ļoti","labi","jā","nē","paldies","labdien","labvakar","labrīt","ardievu","uz","redzēšanos","sveiks","lūdzu","piedodiet","esmu","esi","esam","esat","ir"])) return "lv";
  if (hit(["ja","ei","on","see","kuid","aga","sest","kuna","et","nii","nagu","kui","ehk","kas","kus","mis","millal","miks","kuidas","jah","tänan","palun","vabandage","tere","head","aega","nägemiseni","olen","oled","oleme","olete","on"])) return "et";

  // Turkic
  if (hit(["bir","bu","ve","ile","ki","için","ama","ne","çok","daha","gibi","ya","evet","hayır","tamam","nasıl","merhaba","teşekkür","değil","var","yok","ben","sen","biz","siz","onlar","burada","orada","nerede","kim","hangi","kaç","neden","çünkü","fakat","veya","benim","senin","bizim","sizin","onların","günaydın","iyi","geceler","hoşça","kal"])) return "tr";
  if (hit(["bu","bir","var","olan","daha","çox","mən","sən","biz","siz","onlar","burada","orada","harda","nə","kim","hansı","neçə","necə","niyə","çünki","amma","xeyr","bəli","sağ","ol","buyurun","necəsiz","salamlıq"])) return "az";
  if (hit(["бул","бир","мен","сен","биз","сиз","алар","жакшы","жок","ооба","рахмат","кеч","кечиресиз","сизге","ким","эмне","кайда","качан","үчүн","кантип","канча","кайсы"])) return "ky";
  if (hit(["bu","bir","men","sen","biz","siz","olar","gowy","ýok","hawa","sag","bol","ötünç","siz","kim","näme","nirede","haçan","üçin","nädip","näçe","haýsy"])) return "tk";

  // Southeast / Island Asian
  if (hit(["ang","ng","na","mga","ay","ito","iyan","iyon","saan","kailan","bakit","paano","sino","ano","ilan","alin","kung","kaya","ngunit","subalit","sapagkat","kasi","salamat","kamusta","oo","hindi","magandang","umaga","hapon","gabi","paalam","ingat","mahal","kita","po","ho","ate","kuya"])) return "fil";
  if (hit(["dan","yang","di","ke","dari","ini","itu","ada","tidak","adalah","dengan","untuk","pada","dalam","atau","juga","akan","sudah","bisa","saya","anda","kita","mereka","kami","apa","siapa","dimana","kapan","mengapa","bagaimana","berapa","mana","lebih","sangat","banyak","sedikit","baik","buruk","terima","kasih","halo","selamat","pagi","malam","siang"])) return "id";
  if (hit(["dan","yang","di","ke","dari","ini","itu","ada","tidak","adalah","dengan","untuk","pada","dalam","atau","juga","akan","sudah","boleh","saya","anda","kita","mereka","kami","apa","siapa","mana","bila","mengapa","bagaimana","berapa","lebih","sangat","banyak","sedikit","baik","buruk","terima","kasih","helo","selamat","pagi","malam","siang"])) return "ms";
  if (hit(["lan","kang","wong","sing","ora","iki","iku","ana","saka","ing","dadi","bisa","wis","arep","yen","karo","kanggo","supaya","nanging","utawa","uga","durung","isih","maneh","mung","banget","piye","apa","sopo","ndi","kapan","kenapa","pira","kabeh","ayo","matur","nuwun","sugeng","enjang"])) return "jv"; // Javanese

  // African languages
  if (hit(["na","ni","ya","wa","la","kwa","si","au","pia","lakini","kama","sana","sawa","ndiyo","hapana","asante","habari","karibu","jina","mimi","wewe","yeye","sisi","nyinyi","wao","hapa","pale","wapi","lini","kwa","nini","vipi","nani","ngapi","gani","pole","samahani","kwaheri","nzuri","mbaya","kubwa","ndogo","leo","kesho","jana"])) return "sw";
  if (hit(["en","die","van","is","nie","dat","het","met","te","vir","op","aan","na","in","uit","ek","jy","hy","sy","ons","julle","hulle","wat","waar","wanneer","hoekom","hoe","wie","watter","hoeveel","baie","min","goed","sleg","dankie","hallo","totsiens","more","goeie","ja","nee","asseblief","verskoon"])) return "af";
  if (hit(["ngi","ku","la","nga","ke","kwa","wa","zi","ba","si","nje","ne","noma","kodwa","uma","futhi","namanje","khona","lapho","nini","ngani","kanjani","ubani","ini","ngaki","luphi","sawubona","ngiyabonga","uxolo","hamba","kahle","manje","yebo","cha"])) return "zu";
  if (hit(["ke","le","a","ya","go","re","se","bo","fa","o","mo","di","lo","no","tse","rona","lona","bona","jang","eng","kae","neng","ke","mang","ga","ee","nnyaa","ke","nna","wena","ene"])) return "st"; // Sesotho
  if (hit(["ni","ya","wa","za","la","kwa","si","cha","vya","na","au","lakini","kama","pia","hii","hiyo","ile","hilo","hizi","hizo","zile","wao","yeye","sisi","nyinyi","wangu","wako","wake","wetu","wenu","wao"])) return "sw";

  // Other European
  if (hit(["dhe","është","të","një","me","në","për","nga","si","por","ka","po","jo","çfarë","ku","kur","pse","kush","cili","çdo","shumë","pak","mirë","keq","faleminderit","mirëmëngjesi","mirëdita","dua","nuk","jam","jemi","janë","ishim","keni","kini"])) return "sq";
  if (hit(["agus","i","an","ar","le","ní","go","do","nach","ach","mar","tá","bí","cad","conas","cén","seo","sin","mé","tú","sé","sí","muid","sibh","siad"])) return "ga";
  if (hit(["eu","zaren","da","bat","bai","ez","eta","baina","ala","edo","hemen","hor","han","nun","noiz","zergatik","nola","nor","zer","zenbat","zein","ere","oso","asko","gutxi","on","txar","eskerrik","asko","kaixo","agur","bai","ez"])) return "eu";

  // Haitian Creole
  if (hit(["yo","li","la","m","ou","pa","ka","gen","ale","vini","di","fè","ba","pran","bay","wè","se","nan","ak","pou","san","avèk","depi","lè","si","men","oswa","epi","paske","lòt","tout","yon","anpil","bon","malman","bonswa","bonjou","mèsi","souple"])) return "ht";

  // Esperanto
  if (hit(["kaj","sed","ĉu","ĉar","aŭ","kvankam","dum","post","antaŭ","dankon","bonvolu","saluton","ĝis","revido","bonvenon","mi","vi","li","ŝi","ĝi","ni","ili","estas","estis","estos","estu","kun","sen","tra","pri","super","sub","inter","ĉe","de","en","en","por","por","al"])) return "eo";

  return "en";
}

/** Streaming Speech-to-Text. */
export async function speechToTextStream(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm" = "wav"
): Promise<AsyncIterable<string>> {
  const file = await toFile(audioBuffer, `audio.${format}`);
  const stream = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    stream: true,
  });

  return (async function* () {
    for await (const event of stream) {
      if (event.type === "transcript.text.delta") {
        yield event.delta;
      }
    }
  })();
}
