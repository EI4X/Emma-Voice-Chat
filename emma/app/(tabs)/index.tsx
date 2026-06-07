import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { acquireMicStream } from "@/lib/micStream";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatMessage } from "@/components/ChatMessage";
import { ParticleSphere } from "@/components/ParticleSphere";
import { Sidebar } from "@/components/Sidebar";
import { AppButton, getAppsForContext } from "@/components/EmmaSeesSheet";
import { PresentationSheet } from "@/components/PresentationSheet";
import { useChatContext, ResearchProgressEvent } from "@/context/ChatContext";
import { usePathfinder } from "@/context/PathfinderContext";
import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";

const useNative = Platform.OS !== "web";

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;
const ttsSound = { current: null as Audio.Sound | null };
const ttsAborted = { current: false };

// Stop any currently playing TTS audio
async function stopTTSAudio(): Promise<void> {
  ttsAborted.current = true;
  if (Platform.OS === "web") {
    // Stop Web Audio API source node
    const src = (window as any).__emmaTTSSource;
    if (src) { try { src.stop(); } catch { /* already stopped */ } (window as any).__emmaTTSSource = null; }
    // Stop any fallback HTML audio
    const el = (window as any).__emmaTTSAudio as HTMLAudioElement | null;
    if (el) { try { el.pause(); el.src = ""; } catch { /* ignore */ } }
  }
  if (ttsSound.current) {
    await ttsSound.current.stopAsync().catch(() => {});
    await ttsSound.current.unloadAsync().catch(() => {});
    ttsSound.current = null;
  }
}

// Server-side neural TTS (EmmaNeural via Edge TTS) — used on all platforms
async function speakText(text: string): Promise<void> {
  ttsAborted.current = false;

  if (Platform.OS === "web") {
    // ── Web Audio API path ────────────────────────────────────────────────
    // Create / resume AudioContext SYNCHRONOUSLY before the first await so
    // we're still inside the user-gesture stack frame. Browsers block
    // HTMLAudioElement.play() after async gaps but honour AudioContext that
    // was resumed within the gesture.
    let ctx = (window as any).__emmaTTSCtx as AudioContext | null;
    if (!ctx || ctx.state === "closed") {
      ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)() as AudioContext;
      (window as any).__emmaTTSCtx = ctx;
    }
    const audioCtx = ctx!;
    if (audioCtx.state === "suspended") audioCtx.resume(); // intentionally not awaited

    try {
      const res = await fetch(`${BASE}/emma/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 800) }),
      });
      if (!res.ok || ttsAborted.current) return;
      const { audio: base64 } = await res.json();
      if (!base64 || ttsAborted.current) return;

      // base64 → ArrayBuffer → AudioBuffer
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0));
      if (ttsAborted.current) return;

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      (window as any).__emmaTTSSource = source;

      await new Promise<void>((resolve) => {
        source.onended = () => { (window as any).__emmaTTSSource = null; resolve(); };
        source.start();
      });
    } catch { /* silently ignore */ }
    return;
  }

  // ── Native path (expo-av) ─────────────────────────────────────────────
  try {
    const res = await fetch(`${BASE}/emma/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 800) }),
    });
    if (!res.ok || ttsAborted.current) return;
    const { audio: base64 } = await res.json();
    if (!base64 || ttsAborted.current) return;

    if (ttsSound.current) {
      await ttsSound.current.stopAsync().catch(() => {});
      await ttsSound.current.unloadAsync().catch(() => {});
      ttsSound.current = null;
    }
    const fs = FileSystem as any;
    const uri = (fs.cacheDirectory ?? fs.documentDirectory ?? "") + "emma_chat_tts.mp3";
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: "base64" as any });
    const { sound } = await Audio.Sound.createAsync({ uri });
    ttsSound.current = sound;
    if (ttsAborted.current) { await sound.unloadAsync().catch(() => {}); return; }
    await sound.playAsync();
    await new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) resolve();
        if (!s.isLoaded) resolve();
      });
    });
  } catch { /* silently ignore */ }
}

async function pickImageNative(): Promise<{ uri: string; base64: string } | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Permission needed", "Allow access to your photo library to attach images.");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    base64: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  let base64 = asset.base64 ?? null;
  if (!base64 && asset.uri) {
    if (asset.uri.startsWith("data:")) {
      base64 = asset.uri.split(",")[1] ?? null;
    }
  }
  return base64 ? { uri: asset.uri, base64 } : null;
}

type WebImageResult = { uri: string; base64: string; fileName?: string };
type WebFileResult = { isFile: true; fileName: string; fileText: string };

function _openWebInput(accept: string, capture?: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    if (capture) (input as any).capture = capture;
    input.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;";
    document.body.appendChild(input);
    const cleanup = () => { try { document.body.removeChild(input); } catch { /* already removed */ } };
    input.onchange = (e) => { cleanup(); resolve((e.target as HTMLInputElement).files?.[0] ?? null); };
    input.oncancel = () => { cleanup(); resolve(null); };
    setTimeout(() => input.click(), 10);
  });
}

function _readImageFile(file: File): Promise<WebImageResult | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl?.split(",")[1] ?? null;
      resolve(base64 ? { uri: dataUrl, base64, fileName: file.name } : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function _readTextFile(file: File): Promise<WebFileResult | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      resolve({ isFile: true, fileName: file.name, fileText: text?.slice(0, 12000) ?? "" });
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

/** Web: open photo library (images only) */
async function pickPhotosWeb(): Promise<WebImageResult | null> {
  const file = await _openWebInput("image/*");
  if (!file) return null;
  return _readImageFile(file);
}

/** Web: open camera (uses capture attribute → triggers camera on mobile web) */
async function pickCameraWeb(): Promise<WebImageResult | null> {
  const file = await _openWebInput("image/*", "environment");
  if (!file) return null;
  return _readImageFile(file);
}

/** Web: open document file picker (text files — no images) */
async function pickFilesOnlyWeb(): Promise<WebFileResult | null> {
  const file = await _openWebInput("text/plain,text/csv,text/markdown,.md,.csv,.json,.txt,.log");
  if (!file) return null;
  return _readTextFile(file);
}

interface PendingAttachment {
  type: "image" | "file";
  uri: string;
  base64: string;
  fileName?: string;
}

// ── Synaptic burst — three staggered expanding rings + pulsing core ──────────
const RING_SIZE = 72;
const BURST_PERIOD = 2200;
const BURST_STAGGER = 733;
const BURST_RINGS = 3;
const RING_COLORS = ["#ffffff", "#a855f7", "#06b6d4"] as const;

function SynapticBurst() {
  const c = useColors();
  const r0 = useRef(new Animated.Value(0)).current;
  const r1 = useRef(new Animated.Value(0)).current;
  const r2 = useRef(new Animated.Value(0)).current;
  const corePulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const animRing = (val: Animated.Value, idx: number) => {
      const delay = idx * BURST_STAGGER;
      const wait = (BURST_RINGS - 1 - idx) * BURST_STAGGER;
      const seq: Animated.CompositeAnimation[] = [];
      if (delay > 0) seq.push(Animated.delay(delay));
      seq.push(Animated.timing(val, { toValue: 1, duration: BURST_PERIOD, easing: Easing.out(Easing.ease), useNativeDriver: useNative }));
      seq.push(Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: useNative }));
      if (wait > 0) seq.push(Animated.delay(wait));
      return Animated.loop(Animated.sequence(seq));
    };
    const coreAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(corePulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: useNative }),
        Animated.timing(corePulse, { toValue: 0.25, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: useNative }),
      ])
    );
    const a0 = animRing(r0, 0);
    const a1 = animRing(r1, 1);
    const a2 = animRing(r2, 2);
    a0.start(); a1.start(); a2.start(); coreAnim.start();
    return () => { a0.stop(); a1.stop(); a2.stop(); coreAnim.stop(); };
  }, [r0, r1, r2, corePulse]);

  const ringStyle = (val: Animated.Value, color: string) => ({
    position: "absolute" as const,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1.5,
    borderColor: color,
    opacity: val.interpolate({ inputRange: [0, 0.2, 0.75, 1], outputRange: [0, 0.85, 0.3, 0] }),
    transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [0.06, 1] }) }],
  });

  return (
    <View style={burstStyles.wrap}>
      <View style={burstStyles.orb}>
        <Animated.View style={ringStyle(r0, RING_COLORS[0])} />
        <Animated.View style={ringStyle(r1, RING_COLORS[1])} />
        <Animated.View style={ringStyle(r2, RING_COLORS[2])} />
        <Animated.View style={[burstStyles.core, { backgroundColor: c.foreground, opacity: corePulse }]} />
      </View>
      <Text style={[burstStyles.label, { color: c.foreground }]}>Thinking…</Text>
    </View>
  );
}

// ── Aurora shimmer bar — shown during active token streaming ─────────────────
function AuroraBar() {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: false })
    );
    anim.start();
    return () => anim.stop();
  }, [sweep]);

  const tx = sweep.interpolate({ inputRange: [0, 1], outputRange: [-120, 420] });

  return (
    <View style={burstStyles.auroraTrack}>
      <LinearGradient
        colors={["#7C3AED", "#06b6d4", "#ec4899", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={[burstStyles.auroraSweep, { transform: [{ translateX: tx }] }]}>
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.5)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: 120, height: "100%" as unknown as number }}
        />
      </Animated.View>
    </View>
  );
}

const burstStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  orb: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 15,
    fontWeight: "500" as const,
    letterSpacing: 0.3,
    opacity: 0.85,
  },
  auroraTrack: {
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 6,
  },
  auroraSweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
});

// ── Quick action grid (2 × 2) ─────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "Create image",  icon: "image"      as const, prefix: "Create an image of ",    color: "#7C3AED" },
  { label: "Write & edit",  icon: "edit-2"     as const, prefix: "Help me write ",          color: "#0EA5E9" },
  { label: "Web search",    icon: "globe"      as const, prefix: "Search the web for ",     color: "#10B981" },
  { label: "Analyze data",  icon: "bar-chart-2" as const, prefix: "Analyze this data: ",   color: "#F59E0B" },
] as const;

const ATTACH_ITEMS = [
  { label: "Camera",       icon: "camera"    as const, action: "camera"        },
  { label: "Photos",       icon: "image"     as const, action: "photos"        },
  { label: "Files",        icon: "paperclip" as const, action: "files"         },
  { label: "Presentation", icon: "layers"    as const, action: "presentation"  },
] as const;

const PRESENTATION_KEYWORDS = /\b(presentation|slides?|slide deck|pptx|pitch deck|keynote|powerpoint)\b/i;
const PRESENTATION_INTENT_RE = /\b(create|make|build|generate|write|design|draft|prepare)\s+(?:(?:a|an|me\s+a|the)\s+)?(?:[\w\s]{0,20}\s+)?(presentation|slides?|slide deck|pptx|pitch deck|deck)\b/i;

function extractTopicFromMessage(text: string): string {
  const m = text.match(/(?:presentation|deck|slides?)\s+(?:about|on|for|regarding|covering)\s+([^.!?\n]{4,80})/i)
    ?? text.match(/(?:about|on|for|regarding|covering)\s+([^.!?\n]{4,80})(?:\s+presentation|\s+slides?|\s+deck)?/i);
  if (m?.[1]) return m[1].trim().replace(/\s*[.!?]$/, "");
  return text.replace(PRESENTATION_INTENT_RE, "").trim().slice(0, 60) || text.slice(0, 60);
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const fgMuted = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const fgFaint = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.22)";
  const {
    messages, isStreaming, streamingText, sendMessage, deepResearch, stopStreaming,
    startNewChat, incognito, setIncognito,
    currentConversationId, shareConversation,
  } = useChatContext();

  const { suggestions, analyzeForSuggestions, dismissSuggestion } = usePathfinder();

  const [inputText, setInputText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [sharingChat, setSharingChat] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [presentationTopic, setPresentationTopic] = useState("");
  const [researchMode, setResearchMode] = useState(false);
  const [researchProgress, setResearchProgress] = useState<ResearchProgressEvent | null>(null);
  const inputRef = useRef<TextInput>(null);
  const prevIsStreaming = useRef(false);
  const pendingPresentationRef = useRef<string | null>(null);

  // Analyze each completed AI response for proactive Pathfinder suggestions
  // and auto-open presentation creator when the user explicitly requested one
  useEffect(() => {
    if (prevIsStreaming.current && !isStreaming && streamingText) {
      analyzeForSuggestions(streamingText);
      if (pendingPresentationRef.current !== null) {
        // User explicitly asked for a presentation — auto-open the sheet
        setPresentationTopic(pendingPresentationRef.current);
        setShowPresentation(true);
        pendingPresentationRef.current = null;
      } else if (PRESENTATION_KEYWORDS.test(streamingText) && !showPresentation) {
        // Emma mentioned presentations without an explicit user request — surface a nudge
        const match = streamingText.match(/(?:presentation|deck|slides?)\s+(?:about|on|for|regarding)\s+([^.!?\n]{4,60})/i);
        if (match?.[1]) setPresentationTopic(match[1].trim());
      }
    }
    prevIsStreaming.current = isStreaming;
  }, [isStreaming, streamingText, analyzeForSuggestions, showPresentation]);

  const hasMessages = messages.length > 0 || isStreaming;

  // Clear research progress when streaming finishes
  useEffect(() => {
    if (!isStreaming) setResearchProgress(null);
  }, [isStreaming]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    const hasContent = text || pendingAttachments.length > 0;
    if (!hasContent || isStreaming) return;

    const imageAttachments = pendingAttachments.filter((a) => a.type === "image");
    const imgB64s = imageAttachments.length > 0 ? imageAttachments.map((a) => a.base64) : undefined;
    const msgText = text || (imageAttachments.length > 0 ? "What's in this image?" : "");

    setInputText("");
    setPendingAttachments([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (researchMode) {
      // Deep research mode: multi-source discovery + browser agent + trust scoring + synthesis
      await deepResearch(msgText, (event) => setResearchProgress(event));
      return;
    }

    // Detect if user is explicitly asking to create a presentation
    if (PRESENTATION_INTENT_RE.test(msgText)) {
      pendingPresentationRef.current = extractTopicFromMessage(msgText);
    }

    await sendMessage(msgText, imgB64s);
  }, [inputText, pendingAttachments, isStreaming, sendMessage, deepResearch, researchMode]);

  const handleStop = useCallback(() => {
    stopStreaming();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [stopStreaming]);

  const addAttachment = useCallback((att: PendingAttachment) => {
    setPendingAttachments((prev) => prev.length < 5 ? [...prev, att] : prev);
  }, []);

  const removeAttachment = useCallback((idx: number) => {
    setPendingAttachments((prev) => {
      const removed = prev[idx];
      const next = prev.filter((_, i) => i !== idx);
      if (removed?.type === "file") setInputText("");
      return next;
    });
  }, []);

  const handleAttach = useCallback(async () => {
    Haptics.selectionAsync();
    if (Platform.OS === "web") {
      const result = await pickPhotosWeb();
      if (result) addAttachment({ type: "image", uri: result.uri, base64: result.base64, fileName: result.fileName });
    } else {
      const img = await pickImageNative();
      if (img) addAttachment({ type: "image", uri: img.uri, base64: img.base64 });
    }
  }, [addAttachment]);

  const handleAttachAction = useCallback(async (action: "camera" | "photos" | "files" | "presentation") => {
    setShowAttachMenu(false);
    Haptics.selectionAsync();

    if (action === "presentation") {
      setPresentationTopic(inputText.trim());
      setShowPresentation(true);
      return;
    }

    if (action === "camera") {
      if (Platform.OS === "web") {
        const result = await pickCameraWeb();
        if (result) addAttachment({ type: "image", uri: result.uri, base64: result.base64 });
      } else {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") { Alert.alert("Permission needed", "Allow camera access to take photos."); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
        if (!result.canceled && result.assets[0]) {
          const asset = result.assets[0];
          if (asset.base64) addAttachment({ type: "image", uri: asset.uri, base64: asset.base64 });
        }
      }
      return;
    }

    if (action === "photos") {
      if (Platform.OS === "web") {
        const result = await pickPhotosWeb();
        if (result) addAttachment({ type: "image", uri: result.uri, base64: result.base64, fileName: result.fileName });
      } else {
        const img = await pickImageNative();
        if (img) addAttachment({ type: "image", uri: img.uri, base64: img.base64 });
      }
      return;
    }

    // files
    if (Platform.OS === "web") {
      const result = await pickFilesOnlyWeb();
      if (!result) return;
      const prefix = `[File: ${result.fileName}]\n`;
      setInputText((prev) => (prev ? prev + "\n\n" : "") + prefix + result.fileText);
      addAttachment({ type: "file", uri: "", base64: "", fileName: result.fileName });
    } else {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["text/plain", "text/csv", "text/markdown", "application/json",
                 "application/pdf", "application/msword",
                 "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        try {
          const text = await (FileSystem as any).readAsStringAsync(asset.uri, { encoding: "utf8" as any });
          const prefix = `[File: ${asset.name}]\n`;
          setInputText((prev) => (prev ? prev + "\n\n" : "") + prefix + (text as string).slice(0, 12000));
          addAttachment({ type: "file", uri: asset.uri, base64: "", fileName: asset.name });
        } catch {
          Alert.alert("Can't read file", "Only plain text files can be read. PDF and Word files are not yet supported.");
        }
      } catch {
        // user cancelled or permission denied
      }
    }
  }, [addAttachment]);

  const showToast = useCallback((msg: string, duration = 3000) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(null), duration);
  }, []);

  const handleShareChat = useCallback(async () => {
    if (!currentConversationId || currentConversationId < 0) {
      showToast(incognito ? "Not available in incognito" : "Start a conversation first");
      return;
    }
    setSharingChat(true);
    Haptics.selectionAsync();
    try {
      const url = await shareConversation(currentConversationId);
      if (!url) {
        showToast("Could not generate share link");
        return;
      }
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(url).catch(() => Clipboard.setStringAsync(url));
        if (navigator.share) {
          navigator.share({ url, title: "Emma Chat" }).catch(() => {});
        }
      } else {
        await Clipboard.setStringAsync(url);
      }
      showToast("Share link copied to clipboard!");
    } finally {
      setSharingChat(false);
    }
  }, [currentConversationId, shareConversation, incognito, showToast]);

  const handleToggleIncognito = useCallback(() => {
    const newVal = !incognito;
    setIncognito(newVal);
    Haptics.selectionAsync();
    if (newVal) {
      Alert.alert(
        "Incognito On",
        "Chats won't be saved to history. All messages are erased when you leave.",
        [{ text: "Got it" }]
      );
    }
  }, [incognito, setIncognito]);

  const handleShareMessage = useCallback(async (text: string) => {
    try {
      if (Platform.OS === "web") {
        if (navigator.share) { await navigator.share({ text, title: "Emma AI" }).catch(() => {}); }
        else { await navigator.clipboard?.writeText(text); }
      } else {
        await Share.share({ message: text, title: "Emma AI" });
      }
    } catch { /* user cancelled */ }
  }, []);

  const allMessages =
    isStreaming && streamingText
      ? [
          ...messages,
          {
            id: "streaming",
            role: "assistant" as const,
            content: streamingText,
            createdAt: new Date(),
          },
        ]
      : messages;

  const topPad = Platform.OS === "web" ? 60 : insets.top;

  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 10;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Gradient — purple-navy in dark, soft lavender in light */}
      <LinearGradient
        colors={isDark
          ? (["#0B0718", "#07050F", "#050408"] as const)
          : (["#F5F0FF", "#EDE8FA", "#E8E0F5"] as const)}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* ── Toast ── */}
      {shareToast && (
        <View style={[styles.toast, { top: topPad + 60 }]} pointerEvents="none">
          <Feather name="check-circle" size={14} color="#22c55e" />
          <Text style={styles.toastText}>{shareToast}</Text>
        </View>
      )}

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 4 }]}>
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => { Haptics.selectionAsync(); setSidebarOpen(true); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="menu" size={22} color={c.foreground} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.brandBtn} onPress={() => router.push("/settings")}>
          <Text style={[styles.brandText, { color: c.foreground }]}>{incognito ? "Emma · Incognito" : "Emma"}</Text>
          <Feather name="chevron-right" size={15} color={fgMuted} />
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => router.push("/pathfinder")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="compass" size={21} color={suggestions.length > 0 ? "#a855f7" : fgMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleToggleIncognito}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="eye-off" size={21} color={incognito ? c.foreground : fgMuted} />
          </TouchableOpacity>
          {hasMessages ? (
            <>
              <TouchableOpacity onPress={handleShareChat} disabled={sharingChat} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {sharingChat
                  ? <ActivityIndicator size="small" color={fgMuted} />
                  : <Feather name="share-2" size={21} color={fgMuted} />
                }
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { startNewChat(); Haptics.selectionAsync(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="edit" size={20} color={c.foreground} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={() => router.push("/settings")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="settings" size={21} color={fgMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Dismiss attach menu backdrop ── */}
      {showAttachMenu && (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={() => setShowAttachMenu(false)}
        />
      )}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {!hasMessages ? (
          <View style={styles.heroContainer}>
            {/* ── Emma sphere + title ── */}
            <View style={styles.heroTop}>
              <View style={styles.sphereGlowWrap}>
                <LinearGradient
                  colors={["rgba(124,58,237,0.22)", "rgba(124,58,237,0.06)", "transparent"]}
                  style={StyleSheet.absoluteFillObject}
                />
                <ParticleSphere size={100} mode="idle" />
              </View>
              <Text style={[styles.heroTitle, { color: c.foreground }]}>
                {incognito ? "Incognito" : "Hi, I'm Emma."}
              </Text>
              <Text style={[styles.heroSubtitle, { color: fgMuted }]}>
                {incognito ? "Chats won't be saved." : "What can I help you with?"}
              </Text>
            </View>

            <View style={styles.flex} />
          </View>
        ) : (
          <FlatList
            data={[...allMessages].reverse()}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <ChatMessage
                message={item}
                isStreaming={item.id === "streaming"}
                onStopReadAloud={stopTTSAudio}
                onShare={handleShareMessage}
                onReadAloud={item.id === "streaming" ? undefined : speakText}
              />
            )}
            inverted
            style={styles.messageList}
            contentContainerStyle={styles.messageContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={isStreaming && !streamingText ? <SynapticBurst /> : null}
          />
        )}

        {/* ── Presentation nudge banner ── */}
        {presentationTopic && !showPresentation && !isStreaming && (
          <TouchableOpacity
            style={[styles.presentationBanner, { backgroundColor: "#a855f712", borderColor: "#a855f740" }]}
            onPress={() => setShowPresentation(true)}
            activeOpacity={0.8}
          >
            <View style={styles.presentationBannerIcon}>
              <Feather name="layers" size={16} color="#a855f7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#a855f7", fontSize: 13, fontWeight: "700" }}>Emma can build this presentation</Text>
              <Text style={{ color: "rgba(168,85,247,0.7)", fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                "{presentationTopic}"
              </Text>
            </View>
            <View style={styles.presentationBannerBtn}>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Create</Text>
            </View>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); setPresentationTopic(""); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 4 }}
            >
              <Feather name="x" size={13} color="rgba(168,85,247,0.6)" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* ── Proactive Pathfinder suggestion strip ── */}
        {suggestions.length > 0 && !isStreaming && (
          <View style={[styles.suggestionStrip, { borderTopColor: c.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {suggestions.map((s) => {
                const deeplinks = getAppsForContext(s.tags ?? []);
                return (
                  <View key={s.id} style={[styles.suggestionPill, { backgroundColor: c.card, borderColor: "#a855f740" }]}>
                    <Feather name={s.type === "risk" ? "alert-triangle" : "zap"} size={13} color="#a855f7" />
                    <Text style={[styles.suggestionPillText, { color: c.foreground }]} numberOfLines={1}>{s.title}</Text>
                    <TouchableOpacity onPress={() => { router.push("/pathfinder"); dismissSuggestion(s.id); }}>
                      <Text style={styles.suggestionPillAction}>{s.actionLabel}</Text>
                    </TouchableOpacity>
                    {deeplinks.slice(0, 3).map((appKey) => (
                      <AppButton key={appKey} appKey={appKey} />
                    ))}
                    <TouchableOpacity onPress={() => dismissSuggestion(s.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Feather name="x" size={12} color={c.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Bottom input area ── */}
        <View style={[styles.inputArea, { paddingBottom: bottomPad }]}>
          {isStreaming && streamingText ? <AuroraBar /> : null}

          {/* Attachment previews — scrollable row for multiple images */}
          {pendingAttachments.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.attachScroll}
              contentContainerStyle={styles.attachScrollContent}
            >
              {pendingAttachments.map((att, idx) => (
                <View key={idx} style={styles.attachThumbWrap}>
                  {att.type === "image" ? (
                    <Image source={{ uri: att.uri }} style={styles.attachImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.attachImage, styles.attachFileBox]}>
                      <Feather name="file-text" size={22} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.attachFileName} numberOfLines={2}>{att.fileName ?? "File"}</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.attachRemoveBtn} onPress={() => removeAttachment(idx)}>
                    <Feather name="x" size={11} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {/* Add more button (up to 5) */}
              {pendingAttachments.filter(a => a.type === "image").length < 5 && (
                <TouchableOpacity style={styles.attachAddMore} onPress={handleAttach}>
                  <Feather name="plus" size={20} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          {/* ── Research progress strip ── */}
          {isStreaming && researchMode && researchProgress && (
            <View style={[styles.researchProgressBar, { backgroundColor: "#0f172a", borderColor: "#1e3a5f" }]}>
              <View style={styles.researchProgressLeft}>
                <Feather
                  name={
                    researchProgress.step === "searching" ? "search" :
                    researchProgress.step === "reading" ? "book-open" :
                    researchProgress.step === "analyzing" ? "cpu" : "layers"
                  }
                  size={13}
                  color="#38bdf8"
                />
                <Text style={styles.researchProgressText} numberOfLines={1}>
                  {researchProgress.message}
                </Text>
              </View>
              {researchProgress.totalIterations && (
                <Text style={styles.researchProgressIter}>
                  {researchProgress.iteration}/{researchProgress.totalIterations}
                </Text>
              )}
            </View>
          )}

          {/* Stop button */}
          {isStreaming && (
            <TouchableOpacity style={[styles.stopBtn, { backgroundColor: c.secondary }]} onPress={handleStop} activeOpacity={0.75}>
              <Feather name="square" size={13} color={c.secondaryForeground} />
              <Text style={[styles.stopBtnText, { color: c.secondaryForeground }]}>Stop generating</Text>
            </TouchableOpacity>
          )}

          {/* ── ChatGPT-style input row ── */}
          <View style={styles.inputRow}>
            {/* + button */}
            <TouchableOpacity
              style={[styles.plusBtn, { backgroundColor: c.secondary }]}
              onPress={() => { setShowAttachMenu((v) => !v); Haptics.selectionAsync(); }}
              activeOpacity={0.75}
            >
              <Feather name="plus" size={21} color={c.secondaryForeground} />
            </TouchableOpacity>

            {/* Input pill */}
            <View style={[styles.inputPill, { backgroundColor: c.input }]}>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: c.text }]}
                placeholder={
                  researchMode
                    ? "Deep research query..."
                    : pendingAttachments.length > 0
                    ? "Ask about this..."
                    : "Ask anything..."
                }
                placeholderTextColor={researchMode ? "#38bdf888" : fgMuted}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={4000}
              />
              {/* Send / stop inside pill */}
              <TouchableOpacity
                style={[
                  styles.pillSendBtn,
                  { backgroundColor: c.secondary },
                  (inputText.trim() || pendingAttachments.length > 0) && !isStreaming && {
                    backgroundColor: researchMode ? "#0369a1" : c.primary,
                  },
                ]}
                onPress={isStreaming ? handleStop : handleSend}
                activeOpacity={0.8}
              >
                {isStreaming
                  ? <Feather name="square" size={13} color={c.primaryForeground} />
                  : <Feather name={researchMode ? "search" : "send"} size={15} color={(inputText.trim() || pendingAttachments.length > 0) ? c.primaryForeground : fgMuted} />
                }
              </TouchableOpacity>
            </View>

            {/* Research mode toggle */}
            <TouchableOpacity
              style={[
                styles.voiceBtn,
                {
                  backgroundColor: researchMode ? "#0c4a6e" : c.secondary,
                  borderWidth: researchMode ? 1 : 0,
                  borderColor: researchMode ? "#38bdf8" : "transparent",
                },
              ]}
              onPress={() => { setResearchMode((v) => !v); Haptics.selectionAsync(); }}
              activeOpacity={0.75}
            >
              <Feather name="search" size={18} color={researchMode ? "#38bdf8" : c.secondaryForeground} />
            </TouchableOpacity>

            {/* Voice mode button */}
            <TouchableOpacity
              style={[styles.voiceBtn, { backgroundColor: c.secondary }]}
              onPress={async () => {
                // Acquire mic within user gesture so the browser grants permission
                if (Platform.OS === "web") await acquireMicStream();
                router.push("/voice");
              }}
              activeOpacity={0.75}
            >
              <Feather name="mic" size={20} color={c.secondaryForeground} />
            </TouchableOpacity>
          </View>

          {/* Research mode label */}
          {researchMode && (
            <View style={styles.researchModeLabel}>
              <Feather name="zap" size={11} color="#38bdf8" />
              <Text style={styles.researchModeLabelText}>
                Deep Research · Multi-source · Trust scoring · Browser agent
              </Text>
              <TouchableOpacity onPress={() => setResearchMode(false)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Feather name="x" size={12} color="#38bdf880" />
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.disclaimer, { color: fgFaint }]}>
            {incognito ? "Incognito · Chats won't be saved." : "Emma can make mistakes. Verify important information."}
          </Text>
        </View>
      </KeyboardAvoidingView>

      {/* ── Attach popup ── */}
      {showAttachMenu && (
        <View style={[styles.attachPopup, { bottom: bottomPad + 80, backgroundColor: c.card }]}>
          {ATTACH_ITEMS.map((item, idx) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.attachPopupRow,
                idx < ATTACH_ITEMS.length - 1 && styles.attachPopupRowBorder,
              ]}
              onPress={() => handleAttachAction(item.action)}
              activeOpacity={0.7}
            >
              <View style={[styles.attachPopupIcon, { backgroundColor: c.secondary }]}>
                <Feather name={item.icon} size={20} color={c.secondaryForeground} />
              </View>
              <Text style={[styles.attachPopupLabel, { color: c.foreground }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Sidebar visible={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <PresentationSheet
        visible={showPresentation}
        initialTopic={presentationTopic}
        onClose={() => { setShowPresentation(false); setPresentationTopic(""); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#07050F" },
  flex: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 14, gap: 16,
  },
  headerIconBtn: { padding: 2 },
  brandBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 5,
  },
  brandText: {
    fontSize: 18, fontWeight: "700" as const, color: "#fff", letterSpacing: -0.4,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 20 },
  suggestionStrip: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  presentationBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 12, marginBottom: 6,
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 14, borderWidth: 1,
  },
  presentationBannerIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: "#a855f720",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  presentationBannerBtn: {
    backgroundColor: "#a855f7", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, flexShrink: 0,
  },
  suggestionPill: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  suggestionPillText: { fontSize: 13, fontWeight: "500" as const, maxWidth: 140 },
  suggestionPillAction: { fontSize: 13, fontWeight: "600" as const, color: "#a855f7" },

  // ── Hero ────────────────────────────────────────────────────────────────────
  heroContainer: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },

  heroTop: { alignItems: "center", paddingTop: 20, gap: 8 },
  sphereGlowWrap: {
    width: 116, height: 116, borderRadius: 58,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  heroTitle: {
    fontSize: 26, fontWeight: "700" as const, color: "#fff",
    letterSpacing: -0.8, textAlign: "center" as const,
  },
  heroSubtitle: {
    fontSize: 14, color: "rgba(255,255,255,0.4)",
    textAlign: "center" as const,
  },

  // ── 2×2 quick card grid ───────────────────────────────────────────────────
  quickGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
    paddingBottom: 0,
  },
  quickCard: {
    width: "48.5%" as unknown as number,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12, paddingVertical: 13,
    flexDirection: "row" as const, alignItems: "center" as const, gap: 10,
  },
  quickCardIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  quickCardLabel: {
    fontSize: 13, fontWeight: "500" as const,
    color: "rgba(255,255,255,0.85)", letterSpacing: -0.1,
    flex: 1,
  },

  // ── Message list ─────────────────────────────────────────────────────────────
  messageList: { flex: 1 },
  messageContent: { paddingVertical: 8 },

  // ── Input area ───────────────────────────────────────────────────────────────
  inputArea: { paddingHorizontal: 14, paddingTop: 6, gap: 6 },

  stopBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, alignSelf: "center",
    paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20,
    backgroundColor: "#1C1C1E", marginBottom: 2,
  },
  stopBtnText: { fontSize: 13, fontWeight: "500" as const, color: "#fff" },

  // ── Attachment preview ────────────────────────────────────────────────────────
  attachScroll: { marginHorizontal: -4, marginBottom: 6 },
  attachScrollContent: { paddingHorizontal: 4, gap: 8, paddingVertical: 4 },
  attachThumbWrap: {
    width: 70, height: 70, borderRadius: 12, overflow: "hidden",
    backgroundColor: "#2C2C2E", position: "relative",
  },
  attachImage: { width: 70, height: 70, borderRadius: 12 },
  attachFileBox: {
    alignItems: "center", justifyContent: "center", gap: 4,
    backgroundColor: "#2C2C2E",
  },
  attachFileName: { fontSize: 9, color: "rgba(255,255,255,0.6)", textAlign: "center", paddingHorizontal: 4 },
  attachRemoveBtn: {
    position: "absolute", top: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  attachAddMore: {
    width: 70, height: 70, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.15)",
    borderStyle: "dashed" as const,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  attachName: { fontSize: 13, fontWeight: "500" as const, color: "#fff" },
  attachLabel: { fontSize: 11, color: "rgba(255,255,255,0.45)" },

  // ── ChatGPT input row ─────────────────────────────────────────────────────────
  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
  },
  plusBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#2C2C2E",
    alignItems: "center", justifyContent: "center",
    marginBottom: 0,
  },
  inputPill: {
    flex: 1,
    flexDirection: "row", alignItems: "flex-end",
    backgroundColor: "#1C1C1E",
    borderRadius: 26,
    paddingLeft: 16, paddingRight: 8,
    paddingTop: 10, paddingBottom: 10,
    minHeight: 44,
  },
  input: {
    flex: 1, color: "#fff", fontSize: 16,
    maxHeight: 120, lineHeight: 22, minHeight: 24,
  },
  pillSendBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#3A3A3C",
    alignItems: "center", justifyContent: "center",
    marginLeft: 8,
    alignSelf: "flex-end",
  },
  pillSendBtnActive: {
    backgroundColor: "#fff",
  },
  voiceBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#2C2C2E",
    alignItems: "center", justifyContent: "center",
  },

  // ── Research mode ─────────────────────────────────────────────────────────────
  researchProgressBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: 4, marginBottom: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1,
    gap: 8,
  },
  researchProgressLeft: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  researchProgressText: { fontSize: 12, color: "#38bdf8", flex: 1 },
  researchProgressIter: { fontSize: 11, color: "#38bdf870", fontWeight: "600" as const, flexShrink: 0 },
  researchModeLabel: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 6, paddingTop: 4, paddingBottom: 2,
  },
  researchModeLabelText: {
    flex: 1, fontSize: 11, color: "#38bdf8", fontWeight: "500" as const,
  },

  // ── Attach popup ──────────────────────────────────────────────────────────────
  attachPopup: {
    position: "absolute",
    left: 14,
    width: 230,
    backgroundColor: "#2C2C2E",
    borderRadius: 20,
    paddingVertical: 6,
    zIndex: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  attachPopupRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  attachPopupRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  attachPopupIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#3A3A3C",
    alignItems: "center", justifyContent: "center",
  },
  attachPopupLabel: {
    fontSize: 16, fontWeight: "400" as const, color: "#fff",
  },

  // ── Misc ─────────────────────────────────────────────────────────────────────
  disclaimer: {
    fontSize: 11, textAlign: "center" as const,
    color: "rgba(255,255,255,0.22)", marginTop: 2,
  },
  toast: {
    position: "absolute", alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24,
    backgroundColor: "rgba(28,28,30,0.96)",
    borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)",
    zIndex: 999,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12,
  },
  toastText: { fontSize: 13, fontWeight: "500" as const, color: "#fff" },
});
