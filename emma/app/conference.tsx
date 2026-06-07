import { Feather } from "@expo/vector-icons";
import { AppButtonRow } from "@/components/EmmaSeesSheet";
import { Audio } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathfinder } from "@/context/PathfinderContext";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";

const BASE = typeof process !== "undefined" && process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "/api";

// Pulse animation for the recording dot
function PulseDot({ active }: { active: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) { scale.setValue(1); opacity.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.6, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active]);

  return (
    <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[styles.pulseBg, { transform: [{ scale }], opacity }]} />
      <View style={[styles.pulseDot, { backgroundColor: active ? "#ef4444" : "#888" }]} />
    </View>
  );
}

export default function ConferenceScreen() {
  const c = useColors();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const insets = useSafeAreaInsets();
  const { conferenceNotes, addConferenceNote, conferenceSummary, setConferenceSummary, clearConference } = usePathfinder();

  const [recording, setRecording] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [tab, setTab] = useState<"live" | "summary">("live");
  const recordingRef = useRef<Audio.Recording | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    clearConference();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (Platform.OS !== "web") {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) return;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      }
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setRecording(true);
    } catch { /**/ }
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    if (!recordingRef.current) return;
    setRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) return;

      if (Platform.OS === "web") return;

      const FileSystem = await import("expo-file-system").then((m) => m.default);
      const base64 = await (FileSystem as any).readAsStringAsync(uri, { encoding: "base64" as any });

      const resp = await fetch(`${BASE}/emma/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, mimeType: "audio/m4a" }),
      });
      if (resp.ok) {
        const { text } = await resp.json() as { text: string };
        if (text?.trim()) {
          addConferenceNote(text.trim());
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        }
      }
    } catch { /**/ }
  }, [addConferenceNote]);

  const handleSummarize = useCallback(async () => {
    if (conferenceNotes.length === 0) return;
    setSummarizing(true);
    setTab("summary");
    const transcript = conferenceNotes.map((n, i) => `[${i + 1}] ${n.text}`).join("\n\n");
    let fullText = "";

    try {
      const resp = await fetch(`${BASE}/pathfinder/conference/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!resp.body) { setSummarizing(false); return; }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6)) as { content?: string; done?: boolean };
              if (parsed.content) { fullText += parsed.content; setConferenceSummary(fullText); }
            } catch { /**/ }
          }
        }
      }
    } catch { /**/ }
    setSummarizing(false);
  }, [conferenceNotes, setConferenceSummary]);

  const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={isDark ? ["#0B0718", "#07050F", "#050408"] as const : ["#F5F0FF", "#EDE8FA", "#E8E0F5"] as const}
        style={StyleSheet.absoluteFillObject}
      />
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="chevron-left" size={24} color={c.foreground} />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <PulseDot active={recording} />
          <Text style={[styles.headerTitle, { color: c.foreground }]}>
            {recording ? "Recording..." : "Conference Mode"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => { void handleSummarize(); }}
          style={[styles.summarizeBtn, conferenceNotes.length === 0 && { opacity: 0.4 }]}
          disabled={conferenceNotes.length === 0 || summarizing}
        >
          {summarizing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.summarizeBtnText}>Summarize</Text>}
        </TouchableOpacity>
      </View>

      {/* Sub-header: note count + instruction */}
      <View style={[styles.subHeader, { borderBottomColor: c.border }]}>
        <Text style={[styles.subHeaderText, { color: c.mutedForeground }]}>
          {conferenceNotes.length === 0
            ? "Tap the mic to start capturing speech. Emma will extract action items automatically."
            : `${conferenceNotes.length} transcript segment${conferenceNotes.length !== 1 ? "s" : ""} captured`}
        </Text>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: c.border }]}>
        {(["live", "summary"] as const).map((t) => (
          <TouchableOpacity key={t} style={styles.tab} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? "#a855f7" : c.mutedForeground }]}>
              {t === "live" ? "Live Notes" : "Summary"}
            </Text>
            {tab === t && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {tab === "live" ? (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        >
          {conferenceNotes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>🎙️</Text>
              <Text style={[styles.emptyTitle, { color: c.foreground }]}>Ready to Listen</Text>
              <Text style={[styles.emptySubtitle, { color: c.mutedForeground }]}>
                Hold the mic button to record speech. Emma will transcribe it and extract action items in real-time.
              </Text>
            </View>
          ) : (
            conferenceNotes.map((note, i) => (
              <View key={note.id} style={[styles.noteCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Text style={[styles.noteIndex, { color: "#a855f7" }]}>#{i + 1}</Text>
                  <Text style={[styles.noteTime, { color: c.mutedForeground }]}>{formatTime(note.timestamp)}</Text>
                </View>
                <Text style={[styles.noteText, { color: c.foreground }]}>{note.text}</Text>
                {note.actionItems.length > 0 && (
                  <View style={[styles.actionItemsBox, { backgroundColor: "#a855f710", borderColor: "#a855f730" }]}>
                    <Text style={{ color: "#a855f7", fontSize: 12, fontWeight: "700", marginBottom: 4 }}>⚡ Action Items</Text>
                    {note.actionItems.map((item, j) => (
                      <Text key={j} style={{ color: c.foreground, fontSize: 13, marginBottom: 2 }}>• {item}</Text>
                    ))}
                    <AppButtonRow
                      appKeys={["gmail", "outlook", "notion", "slack", "teams"]}
                      label="Open in..."
                    />
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}>
          {!conferenceSummary && !summarizing ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
              <Text style={[styles.emptyTitle, { color: c.foreground }]}>No Summary Yet</Text>
              <Text style={[styles.emptySubtitle, { color: c.mutedForeground }]}>
                Capture some speech then tap Summarize to get key points, decisions, action items, and a follow-up email draft.
              </Text>
            </View>
          ) : summarizing ? (
            <View style={[styles.summaryBox, { backgroundColor: c.card, borderColor: c.border }]}>
              <ActivityIndicator color="#a855f7" />
              <Text style={{ color: c.mutedForeground, fontSize: 14, marginTop: 12, textAlign: "center" }}>Emma is generating your summary...</Text>
            </View>
          ) : (
            <View style={[styles.summaryBox, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.summaryText, { color: c.foreground }]}>{conferenceSummary}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Mic button */}
      <View style={[styles.micRow, { bottom: insets.bottom + 24 }]}>
        <Pressable
          onPressIn={() => { void startRecording(); }}
          onPressOut={() => { void stopAndTranscribe(); }}
          style={({ pressed }) => [
            styles.micBtn,
            { backgroundColor: recording || pressed ? "#ef4444" : "#a855f7" },
          ]}
        >
          <Feather name={recording ? "square" : "mic"} size={28} color="#fff" />
        </Pressable>
        <Text style={[styles.micHint, { color: c.mutedForeground }]}>
          {recording ? "Release to transcribe" : "Hold to record"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  summarizeBtn: { backgroundColor: "#a855f7", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  summarizeBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  subHeader: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1 },
  subHeaderText: { fontSize: 13, lineHeight: 18 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, marginHorizontal: 16 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, position: "relative" },
  tabText: { fontSize: 14, fontWeight: "600" },
  tabIndicator: { position: "absolute", bottom: 0, left: "25%", right: "25%", height: 2, backgroundColor: "#a855f7", borderRadius: 1 },
  noteCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  noteIndex: { fontSize: 13, fontWeight: "700" },
  noteTime: { fontSize: 12 },
  noteText: { fontSize: 14, lineHeight: 21 },
  actionItemsBox: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1 },
  summaryBox: { borderRadius: 14, borderWidth: 1, padding: 16 },
  summaryText: { fontSize: 14, lineHeight: 22 },
  micRow: { position: "absolute", alignSelf: "center", alignItems: "center" },
  micBtn: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#a855f7", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10 },
  micHint: { fontSize: 12, marginTop: 8 },
  pulseBg: { position: "absolute", width: 16, height: 16, borderRadius: 8, backgroundColor: "#ef444460" },
  pulseDot: { width: 9, height: 9, borderRadius: 5, position: "absolute" },
  emptyState: { alignItems: "center", padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
