import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ParticleSphere } from "@/components/ParticleSphere";
import { useChatContext } from "@/context/ChatContext";
import { useTheme } from "@/context/ThemeContext";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useColors } from "@/hooks/useColors";

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

type VoiceState = "idle" | "listening" | "processing" | "thinking" | "speaking";

// ── Native VAD constants ───────────────────────────────────────────────────────
const NATIVE_SPEECH_THR  = 0.30;
const NATIVE_SILENCE_THR = 0.22;
const VAD_SILENCE_MS     = 1400;
const VAD_MIN_SPEECH_MS  = 350;
const INTERRUPT_SUSTAIN_MS = 280;

// ── Animated amplitude (sphere while TTS plays or while web is "listening") ───
function useAnimatedAmplitude(active: boolean): number {
  const [amp, setAmp] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tRef = useRef(0);
  useEffect(() => {
    if (active) {
      tRef.current = 0;
      timerRef.current = setInterval(() => {
        tRef.current += 0.12;
        const v =
          0.35 +
          0.32 * Math.sin(tRef.current) +
          0.18 * Math.sin(tRef.current * 2.3 + 1) +
          0.12 * Math.sin(tRef.current * 0.7);
        setAmp(Math.max(0, Math.min(1, v)));
      }, 50);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setAmp(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active]);
  return amp;
}

// ── TTS helpers ────────────────────────────────────────────────────────────────
async function fetchTTSAudio(text: string, language = "en"): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/emma/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 400), language }),
    });
    if (!res.ok) return null;
    const { audio } = await res.json();
    return (audio as string | null) ?? null;
  } catch {
    return null;
  }
}

async function playBase64Audio(
  base64: string,
  soundRef: React.MutableRefObject<Audio.Sound | null>,
  webAudioCtxRef: React.MutableRefObject<AudioContext | null>,
): Promise<void> {
  if (Platform.OS === "web") {
    try {
      const bin = atob(base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const existing = webAudioCtxRef.current;
      const ctx: AudioContext = (!existing || existing.state === "closed")
        ? (() => {
            const c = new ((window as any).AudioContext || (window as any).webkitAudioContext)() as AudioContext;
            webAudioCtxRef.current = c;
            return c;
          })()
        : existing;
      if (ctx.state === "suspended") await ctx.resume();
      const buf = await ctx.decodeAudioData(arr.buffer.slice(0));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      (window as any).__emmaTTSVoiceSource = src;
      await new Promise<void>((res) => { src.onended = () => res(); src.start(0); });
    } catch {
      // AudioContext failed (e.g. MP3 not decodable) — fall back to HTML Audio element
      try {
        await new Promise<void>((resolve) => {
          const el = new (window as any).Audio() as HTMLAudioElement;
          el.src = `data:audio/mpeg;base64,${base64}`;
          el.onended = () => resolve();
          el.onerror = () => resolve(); // don't hang on codec error
          el.play().catch(() => resolve());
        });
      } catch { /* silent */ }
    }
    return;
  }
  // ── Native ──────────────────────────────────────────────────────────────────
  // CRITICAL: switch audio session back to playback mode after recording.
  // Without this, iOS plays TTS through the earpiece (or stays muted on silent).
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
  } catch { /* ignore — non-fatal */ }
  try {
    if (soundRef.current) { await soundRef.current.unloadAsync().catch(() => {}); soundRef.current = null; }
    const uri = `${(FileSystem as any).cacheDirectory}tts_${Date.now()}.mp3`;
    await (FileSystem as any).writeAsStringAsync(uri, base64, { encoding: "base64" as any });
    // shouldPlay:true starts immediately on load (avoids a separate playAsync call)
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
    soundRef.current = sound;
    await new Promise<void>((resolve) => {
      // Safety timeout: never hang longer than 60 s
      const timeout = setTimeout(resolve, 60_000);
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) { clearTimeout(timeout); resolve(); }
        if (!s.isLoaded) { clearTimeout(timeout); resolve(); } // error state
      });
    });
    await sound.unloadAsync().catch(() => {});
    soundRef.current = null;
  } catch { /* silent */ }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const { resolvedTheme } = useTheme();
  const { sendMessage } = useChatContext();

  const { amplitude, startRecording, stopRecording, cancelRecording } = useAudioRecorder();

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  const [statusText, setStatusText] = useState("Starting...");

  // Audio refs
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioCtxRef = useRef<AudioContext | null>(null);
  const speakingAmplitude = useAnimatedAmplitude(voiceState === "speaking");
  const webListeningAmplitude = useAnimatedAmplitude(
    Platform.OS === "web" && voiceState === "listening" && !isMuted,
  );

  // TTS streaming
  const ttsAbortRef     = useRef(false);
  const ttsQueueRef     = useRef<Array<Promise<string | null>>>([]);
  const ttsPlayingRef   = useRef(false);
  const ttsAllQueuedRef = useRef(false);
  const ttsResolveRef   = useRef<(() => void) | null>(null);

  // VAD refs (native)
  const voiceStateRef        = useRef<VoiceState>("idle");
  const isMutedRef           = useRef(false);
  const hasSpeechRef         = useRef(false);
  const speechStartRef       = useRef<number | null>(null);
  const silenceStartRef      = useRef<number | null>(null);
  const interruptSustainRef  = useRef<number | null>(null);
  const processAudioCbRef    = useRef<(() => Promise<void>) | undefined>(undefined);
  const startListeningCbRef  = useRef<(() => Promise<boolean>) | undefined>(undefined);
  const stopTTSCbRef         = useRef<(() => Promise<void>) | undefined>(undefined);
  const detectedLangRef      = useRef<string>("en");

  // Web Speech API refs
  const webSpeechRef           = useRef<any>(null);
  const webFinalTranscriptRef  = useRef<string>("");
  const processWebTxCbRef      = useRef<((text: string) => Promise<void>) | undefined>(undefined);

  // Keep refs in sync
  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // ── TTS drain ────────────────────────────────────────────────────────────────
  const drainTTSQueue = useCallback(async () => {
    ttsPlayingRef.current = true;
    while (true) {
      if (ttsAbortRef.current) { ttsPlayingRef.current = false; ttsQueueRef.current = []; break; }
      if (ttsQueueRef.current.length > 0) {
        const audioPromise = ttsQueueRef.current.shift()!;
        const base64 = await audioPromise;
        if (base64 && !ttsAbortRef.current) {
          await playBase64Audio(base64, soundRef, webAudioCtxRef);
        }
      } else if (ttsAllQueuedRef.current) {
        ttsPlayingRef.current = false;
        ttsResolveRef.current?.();
        ttsResolveRef.current = null;
        break;
      } else {
        await new Promise<void>((r) => setTimeout(r, 30));
      }
    }
  }, []);

  const onSentence = useCallback((sentence: string) => {
    if (ttsAbortRef.current || isMutedRef.current) return;
    const audioPromise = fetchTTSAudio(sentence, detectedLangRef.current);
    ttsQueueRef.current.push(audioPromise);
    if (!ttsPlayingRef.current) {
      setVoiceState("speaking");
      setStatusText("Emma is speaking...");
      drainTTSQueue();
    }
  }, [drainTTSQueue]);

  const stopTTS = useCallback(async () => {
    ttsAbortRef.current = true;
    ttsQueueRef.current = [];
    ttsPlayingRef.current = false;
    ttsAllQueuedRef.current = false;
    const src = (window as any).__emmaTTSVoiceSource;
    if (src) { try { src.stop(); } catch { /* already stopped */ } (window as any).__emmaTTSVoiceSource = null; }
    if (soundRef.current) { await soundRef.current.stopAsync().catch(() => {}); }
  }, []);

  // ── Native VAD core ───────────────────────────────────────────────────────────
  const resetVADState = useCallback(() => {
    hasSpeechRef.current = false;
    speechStartRef.current = null;
    silenceStartRef.current = null;
    interruptSustainRef.current = null;
  }, []);

  const handleVADAmplitude = useCallback((rms: number, speechThr: number, silenceThr: number, interruptThr: number) => {
    const state = voiceStateRef.current;
    const now = Date.now();
    if (state === "listening") {
      if (rms > speechThr) {
        if (!hasSpeechRef.current) { hasSpeechRef.current = true; speechStartRef.current = now; }
        silenceStartRef.current = null;
      } else {
        if (hasSpeechRef.current) {
          if (silenceStartRef.current === null) { silenceStartRef.current = now; }
          else if (now - silenceStartRef.current >= VAD_SILENCE_MS) {
            const dur = speechStartRef.current ? now - speechStartRef.current : 0;
            resetVADState();
            if (dur >= VAD_MIN_SPEECH_MS) processAudioCbRef.current?.();
          }
        }
      }
    } else if (state === "speaking") {
      if (rms > interruptThr) {
        if (interruptSustainRef.current === null) { interruptSustainRef.current = now; }
        else if (now - interruptSustainRef.current >= INTERRUPT_SUSTAIN_MS) {
          interruptSustainRef.current = null;
          stopTTSCbRef.current?.().then(() => { resetVADState(); startListeningCbRef.current?.(); });
        }
      } else {
        interruptSustainRef.current = null;
      }
    }
  }, [resetVADState]);

  useEffect(() => { stopTTSCbRef.current = stopTTS; }, [stopTTS]);

  // ── Native VAD: amplitude from hook ──────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web") return;
    handleVADAmplitude(amplitude, NATIVE_SPEECH_THR, NATIVE_SILENCE_THR, NATIVE_SILENCE_THR * 1.4);
  }, [amplitude, handleVADAmplitude]);

  // ── Web Speech API: start listening ──────────────────────────────────────────
  const startWebListening = useCallback((): boolean => {
    if (Platform.OS !== "web") return false;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return false;

    // Abort any previous instance
    try { webSpeechRef.current?.abort(); } catch { /* ok */ }
    webSpeechRef.current = null;
    webFinalTranscriptRef.current = "";

    try {
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";

      recognition.onstart = () => {
        setVoiceState("listening");
        setStatusText("Listening...");
        setTranscript("");
        setResponseText("");
      };

      recognition.onresult = (event: any) => {
        let finalChunk = "";
        let interimChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalChunk += t;
          else interimChunk += t;
        }
        webFinalTranscriptRef.current = (webFinalTranscriptRef.current + finalChunk).trim();
        setTranscript(webFinalTranscriptRef.current || interimChunk);
      };

      recognition.onend = () => {
        webSpeechRef.current = null;
        const text = webFinalTranscriptRef.current;
        if (text && voiceStateRef.current === "listening") {
          processWebTxCbRef.current?.(text);
        } else if (!text && voiceStateRef.current === "listening") {
          // Nothing heard — restart
          startListeningCbRef.current?.();
        }
      };

      recognition.onerror = (event: any) => {
        webSpeechRef.current = null;
        if (event.error === "aborted") return; // intentional — ignore
        if (event.error === "no-speech") {
          if (voiceStateRef.current === "listening") startListeningCbRef.current?.();
          return;
        }
        // Any other error (not-allowed, network, etc.)
        setStatusText("Tap mic to start");
        setVoiceState("idle");
      };

      webSpeechRef.current = recognition;
      recognition.start();
      return true;
    } catch {
      return false;
    }
  }, []);

  // ── Process web speech transcript → send to API → TTS ─────────────────────
  const processWebTranscript = useCallback(async (text: string) => {
    setTranscript(text);
    setVoiceState("thinking");
    setStatusText("Emma is thinking...");

    ttsAbortRef.current = false;
    ttsQueueRef.current = [];
    ttsPlayingRef.current = false;
    ttsAllQueuedRef.current = false;

    const ttsCompletePromise = new Promise<void>((resolve) => {
      ttsResolveRef.current = resolve;
    });

    try {
      const response = await sendMessage(text, undefined, onSentence, true);
      ttsAllQueuedRef.current = true;

      if (!response) { await startListeningCbRef.current?.(); return; }

      setResponseText(response);
      if (ttsPlayingRef.current) await ttsCompletePromise;
      if (!ttsAbortRef.current) await startListeningCbRef.current?.();
    } catch {
      setStatusText("Error — retrying...");
      setTimeout(() => startListeningCbRef.current?.(), 1500);
    }
  }, [sendMessage, onSentence]);

  useEffect(() => { processWebTxCbRef.current = processWebTranscript; }, [processWebTranscript]);

  // ── Core actions ──────────────────────────────────────────────────────────────
  const startListening = useCallback(async (): Promise<boolean> => {
    if (isMutedRef.current) { setStatusText("Mic muted — unmute to speak"); return false; }

    // Web: use SpeechRecognition API (no getUserMedia needed)
    if (Platform.OS === "web") {
      const ok = startWebListening();
      if (!ok) { setStatusText("Voice not supported in this browser"); setVoiceState("idle"); }
      return ok;
    }

    // Native: expo-av recording + Whisper
    resetVADState();
    const started = await startRecording();
    if (started) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setVoiceState("listening");
      setStatusText("Listening...");
      setTranscript("");
      setResponseText("");
      return true;
    }
    setVoiceState("idle");
    setStatusText("Tap mic to start");
    return false;
  }, [startWebListening, startRecording, resetVADState]);

  useEffect(() => { startListeningCbRef.current = startListening; }, [startListening]);

  // ── Native processAudio (Whisper transcription path) ─────────────────────────
  const processAudio = useCallback(async () => {
    if (voiceStateRef.current !== "listening") return;
    setVoiceState("processing");
    setStatusText("Transcribing...");

    const audioBase64 = await stopRecording();
    if (!audioBase64) { await startListeningCbRef.current?.(); return; }

    try {
      const transcribeRes = await fetch(`${BASE}/emma/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: audioBase64, format: "m4a" }),
      });
      const { transcript: text, language } = await transcribeRes.json();
      if (language) detectedLangRef.current = language;

      if (!text?.trim()) { await startListeningCbRef.current?.(); return; }

      await processWebTranscript(text); // same send+TTS logic
    } catch {
      setStatusText("Error — retrying...");
      setTimeout(() => startListeningCbRef.current?.(), 1500);
    }
  }, [stopRecording, processWebTranscript]);

  useEffect(() => { processAudioCbRef.current = processAudio; }, [processAudio]);

  // ── Auto-start on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => startListeningCbRef.current?.(), 500);
    return () => clearTimeout(t);
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      ttsAbortRef.current = true;
      if (Platform.OS === "web") {
        try { webSpeechRef.current?.abort(); } catch { /* ok */ }
      } else {
        cancelRecording().catch(() => {});
      }
    };
  }, [cancelRecording]);

  // ── Manual controls ───────────────────────────────────────────────────────────
  const handleMicPress = useCallback(async () => {
    if (voiceState === "idle") {
      await startListening();
    } else if (voiceState === "listening") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (Platform.OS === "web") {
        // Stop recognition → onend fires → processes transcript
        try { webSpeechRef.current?.stop(); } catch { /* ok */ }
      } else {
        resetVADState();
        await processAudio();
      }
    } else if (voiceState === "speaking") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await stopTTS();
      resetVADState();
      await startListening();
    }
  }, [voiceState, startListening, processAudio, stopTTS, resetVADState]);

  const handleClose = useCallback(async () => {
    ttsAbortRef.current = true;
    if (Platform.OS === "web") {
      try { webSpeechRef.current?.abort(); } catch { /* ok */ }
    } else {
      await cancelRecording();
    }
    await stopTTS();
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
    }
    router.back();
  }, [cancelRecording, stopTTS]);

  const handleToggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    Haptics.selectionAsync();
    setStatusText(next ? "Mic muted" : "Listening...");
    if (next && Platform.OS === "web") {
      try { webSpeechRef.current?.abort(); } catch { /* ok */ }
    }
  }, [isMuted]);

  const handlePause = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    ttsAbortRef.current = true;
    resetVADState();
    if (Platform.OS === "web") {
      try { webSpeechRef.current?.abort(); } catch { /* ok */ }
    } else if (voiceState === "listening") {
      await cancelRecording();
    } else {
      await stopTTS();
    }
    if (soundRef.current) { await soundRef.current.stopAsync().catch(() => {}); }
    setVoiceState("idle");
    setStatusText("Tap mic to resume");
    setTranscript("");
  }, [voiceState, cancelRecording, stopTTS, resetVADState]);

  // ── Derived display values ────────────────────────────────────────────────────
  const micDisabled = voiceState === "processing" || voiceState === "thinking";
  const showPause = voiceState === "speaking" || voiceState === "listening"
    || voiceState === "processing" || voiceState === "thinking";

  // On web we use animated amplitude (no raw mic data); on native use hook amplitude
  const listeningAmplitude = Platform.OS === "web" ? webListeningAmplitude : amplitude;

  const sphereAmplitude =
    voiceState === "listening"
      ? isMuted ? 0 : listeningAmplitude
      : voiceState === "speaking"
      ? speakingAmplitude
      : 0;

  const sphereMode: "idle" | "listening" | "speaking" =
    voiceState === "listening" ? "listening"
    : voiceState === "speaking" ? "speaking"
    : "idle";

  const micIconName = voiceState === "listening" ? "square" : "mic";
  const micBg =
    voiceState === "listening" ? c.foreground
    : voiceState === "idle" ? c.secondary
    : voiceState === "speaking" ? "#22d3ee22"
    : c.secondary;
  const micBorderColor = voiceState === "speaking" ? "#22d3ee" : voiceState === "listening" ? c.foreground : c.border;
  const micIconColor =
    voiceState === "listening" ? c.background
    : voiceState === "speaking" ? "#22d3ee"
    : c.foreground;

  const statusColor =
    voiceState === "listening" ? (isMuted ? c.mutedForeground : c.foreground)
    : voiceState === "speaking" ? "#22d3ee"
    : voiceState === "idle" ? c.mutedForeground
    : c.mutedForeground;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: c.background, paddingTop: insets.top, paddingBottom: insets.bottom + 8 },
      ]}
    >
      <StatusBar style={resolvedTheme === "light" ? "dark" : "light"} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={[styles.headerPill, { backgroundColor: c.secondary, borderColor: c.border }]}>
          <View
            style={[
              styles.emmaDot,
              {
                backgroundColor:
                  voiceState === "speaking" ? "#22d3ee"
                  : voiceState === "listening" ? c.foreground
                  : c.mutedForeground,
              },
            ]}
          />
          <Text style={[styles.headerTitle, { color: c.foreground }]}>Emma</Text>
          <View style={[styles.handsFreeBadge, { backgroundColor: "#7c3aed22", borderColor: "#7c3aed44" }]}>
            <Text style={styles.handsFreeText}>hands-free</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/settings")}
          style={[styles.settingsBtn, { backgroundColor: c.secondary, borderColor: c.border }]}
        >
          <Feather name="settings" size={18} color={c.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* ── Sphere ── */}
      <View style={styles.sphereContainer}>
        <LinearGradient
          colors={
            voiceState === "speaking"
              ? ["#22d3ee22", "#22d3ee08", "transparent"]
              : voiceState === "listening"
              ? [`${c.foreground}18`, `${c.foreground}06`, "transparent"]
              : [`${c.foreground}0a`, "transparent"]
          }
          style={styles.sphereGlow}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
        <ParticleSphere amplitude={sphereAmplitude} size={270} mode={sphereMode} />
      </View>

      {/* ── Status ── */}
      <View style={styles.statusContainer}>
        {transcript ? (
          <Text style={[styles.transcript, { color: c.mutedForeground }]}>"{transcript}"</Text>
        ) : null}

        <Text style={[styles.statusText, { color: statusColor }]}>
          {isMuted && voiceState !== "idle" ? "Mic muted" : statusText}
        </Text>

        {voiceState === "speaking" ? (
          <Text style={[styles.interruptHint, { color: c.mutedForeground }]}>
            Tap mic to interrupt
          </Text>
        ) : voiceState === "listening" && !isMuted ? (
          <Text style={[styles.interruptHint, { color: c.mutedForeground }]}>
            {Platform.OS === "web" ? "Speak, then pause to send" : "Stop speaking to send"}
          </Text>
        ) : null}

        {responseText && voiceState !== "listening" && voiceState !== "idle" ? (
          <ScrollView style={styles.responseScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.responseText, { color: c.foreground }]}>{responseText}</Text>
          </ScrollView>
        ) : null}
      </View>

      {/* ── Controls ── */}
      <View style={styles.controls}>
        {/* Close */}
        <TouchableOpacity
          onPress={handleClose}
          style={[styles.closeBtn, { backgroundColor: c.secondary, borderColor: c.border }]}
          activeOpacity={0.7}
        >
          <Feather name="x" size={22} color={c.foreground} />
        </TouchableOpacity>

        {/* Mic */}
        <TouchableOpacity
          onPress={handleMicPress}
          disabled={micDisabled}
          style={[styles.micBtn, { backgroundColor: micBg, borderWidth: 2, borderColor: micBorderColor, opacity: micDisabled ? 0.4 : 1 }]}
          activeOpacity={0.7}
        >
          <Feather name={micIconName as any} size={28} color={micIconColor} />
        </TouchableOpacity>

        {/* Mute or Pause */}
        {showPause ? (
          <TouchableOpacity
            onPress={handlePause}
            style={[styles.muteBtn, { backgroundColor: c.secondary, borderColor: c.border }]}
            activeOpacity={0.7}
          >
            <Feather name="pause" size={20} color={c.mutedForeground} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleToggleMute}
            style={[styles.muteBtn, { backgroundColor: isMuted ? c.secondary : "transparent", borderColor: isMuted ? c.foreground : c.border }]}
            activeOpacity={0.7}
          >
            <Feather name={isMuted ? "mic-off" : "volume-2"} size={20} color={isMuted ? c.foreground : c.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {voiceState === "idle" && (
        <Text style={[styles.muteLabel, { color: c.mutedForeground }]}>
          Paused · tap mic to resume
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    width: "100%", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, gap: 8,
  },
  headerPill: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  emmaDot: { width: 8, height: 8, borderRadius: 4 },
  headerTitle: { fontSize: 15, fontWeight: "600" as const },
  handsFreeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  handsFreeText: { fontSize: 9, fontWeight: "600" as const, color: "#a78bfa", letterSpacing: 0.3 },
  settingsBtn: {
    position: "absolute", right: 20, width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  sphereContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  sphereGlow: { position: "absolute", width: 340, height: 340, borderRadius: 170 },
  statusContainer: {
    alignItems: "center", paddingHorizontal: 32, paddingBottom: 12,
    gap: 6, minHeight: 90, maxHeight: 170, width: "100%",
  },
  transcript: { fontSize: 13, textAlign: "center", fontStyle: "italic", lineHeight: 18 },
  statusText: { fontSize: 15, fontWeight: "500" as const },
  interruptHint: { fontSize: 12 },
  responseScroll: { maxHeight: 90, width: "100%" },
  responseText: { fontSize: 14, lineHeight: 21, textAlign: "center" },
  controls: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 28, paddingVertical: 20, paddingHorizontal: 40, width: "100%",
  },
  closeBtn: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  micBtn: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  muteBtn: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  muteLabel: { fontSize: 12, paddingBottom: 4 },
});
