import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";

const BASE = typeof process !== "undefined" && process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "/api";

// ── App definitions (inline, no server round-trip needed) ─────────────────────

interface AppDef {
  label: string;
  emoji: string;
  scheme: string;
  webUrl: string;
  color: string;
}

const APPS: Record<string, AppDef> = {
  gmail:         { label: "Gmail",        emoji: "📧", scheme: "googlegmail://co",                    webUrl: "https://mail.google.com/mail/u/0/#compose", color: "#EA4335" },
  outlook:       { label: "Outlook",      emoji: "📮", scheme: "ms-outlook://emails/new",             webUrl: "https://outlook.live.com/mail/0/deeplink/compose", color: "#0078D4" },
  notion:        { label: "Notion",       emoji: "📝", scheme: "notion://",                           webUrl: "https://notion.so",  color: "#1a1a1a" },
  slack:         { label: "Slack",        emoji: "💬", scheme: "slack://open",                        webUrl: "https://slack.com",  color: "#4A154B" },
  teams:         { label: "Teams",        emoji: "🤝", scheme: "msteams://",                          webUrl: "https://teams.microsoft.com", color: "#5059C9" },
  whatsapp:      { label: "WhatsApp",     emoji: "💬", scheme: "whatsapp://send?text=",               webUrl: "https://wa.me",      color: "#25D366" },
  telegram:      { label: "Telegram",     emoji: "✈️", scheme: "tg://msg",                            webUrl: "https://t.me",       color: "#2AABEE" },
  googledrive:   { label: "Drive",        emoji: "🗂️", scheme: "googledrive://",                      webUrl: "https://drive.google.com/drive/my-drive", color: "#4285F4" },
  googlecalendar:{ label: "Calendar",     emoji: "📅", scheme: "googlecalendar://",                   webUrl: "https://calendar.google.com", color: "#1a73e8" },
  googlemaps:    { label: "Maps",         emoji: "🗺️", scheme: "comgooglemaps://",                    webUrl: "https://maps.google.com", color: "#34A853" },
  uber:          { label: "Uber",         emoji: "🚗", scheme: "uber://",                             webUrl: "https://m.uber.com", color: "#000000" },
  airbnb:        { label: "Airbnb",       emoji: "🏠", scheme: "airbnb://",                           webUrl: "https://airbnb.com", color: "#FF5A5F" },
  booking:       { label: "Booking.com",  emoji: "🏨", scheme: "booking://",                          webUrl: "https://booking.com", color: "#003580" },
  instagram:     { label: "Instagram",    emoji: "📸", scheme: "instagram://",                        webUrl: "https://instagram.com", color: "#E1306C" },
  tiktok:        { label: "TikTok",       emoji: "🎵", scheme: "tiktok://",                           webUrl: "https://tiktok.com", color: "#010101" },
  youtube:       { label: "YouTube",      emoji: "▶️", scheme: "youtube://",                          webUrl: "https://youtube.com", color: "#FF0000" },
  linkedin:      { label: "LinkedIn",     emoji: "💼", scheme: "linkedin://",                         webUrl: "https://linkedin.com", color: "#0077B5" },
  amazon:        { label: "Amazon",       emoji: "📦", scheme: "com.amazon.mobile.shopping://",       webUrl: "https://amazon.com", color: "#FF9900" },
  todoist:       { label: "Todoist",      emoji: "✅", scheme: "todoist://",                          webUrl: "https://todoist.com", color: "#DB4035" },
  trello:        { label: "Trello",       emoji: "📋", scheme: "trello://",                           webUrl: "https://trello.com", color: "#0052CC" },
  evernote:      { label: "Evernote",     emoji: "📔", scheme: "evernote://",                         webUrl: "https://evernote.com", color: "#00A82D" },
  spotify:       { label: "Spotify",      emoji: "🎵", scheme: "spotify://",                          webUrl: "https://open.spotify.com", color: "#1DB954" },
  paypal:        { label: "PayPal",       emoji: "💳", scheme: "paypal://",                           webUrl: "https://paypal.com", color: "#003087" },
  canva:         { label: "Canva",        emoji: "🎨", scheme: "canva://",                            webUrl: "https://canva.com", color: "#00C4CC" },
  chatgpt:       { label: "ChatGPT",      emoji: "🤖", scheme: "openai-chatgpt://",                   webUrl: "https://chat.openai.com", color: "#10a37f" },
};

async function openApp(key: string) {
  const app = APPS[key];
  if (!app) return;
  if (Platform.OS === "web") {
    window.open(app.webUrl, "_blank");
    return;
  }
  try {
    const canOpen = await Linking.canOpenURL(app.scheme);
    await Linking.openURL(canOpen ? app.scheme : app.webUrl);
  } catch {
    await Linking.openURL(app.webUrl);
  }
}

// ── Context → suggested apps map ─────────────────────────────────────────────

export const CONTEXT_APPS: Record<string, string[]> = {
  email:        ["gmail", "outlook", "slack"],
  meeting:      ["gmail", "notion", "slack", "teams"],
  conference:   ["gmail", "notion", "slack", "teams"],
  "follow-up":  ["gmail", "outlook", "notion"],
  document:     ["notion", "googledrive", "evernote"],
  notes:        ["notion", "evernote", "googledrive"],
  social:       ["instagram", "tiktok", "youtube", "linkedin"],
  content:      ["instagram", "tiktok", "youtube", "canva"],
  shopping:     ["amazon"],
  travel:       ["googlemaps", "uber", "airbnb", "booking"],
  productivity: ["notion", "todoist", "trello"],
  task:         ["todoist", "trello", "notion"],
  communication:["whatsapp", "telegram", "slack"],
  finance:      ["paypal"],
  music:        ["spotify"],
  study:        ["notion", "evernote", "todoist"],
  research:     ["notion", "googledrive"],
  design:       ["canva"],
  general:      ["gmail", "notion", "googledrive"],
};

export function getAppsForContext(detected: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const ctx of detected) {
    const apps = CONTEXT_APPS[ctx.toLowerCase()] ?? [];
    for (const a of apps) {
      if (!seen.has(a)) { seen.add(a); result.push(a); }
    }
  }
  return result.slice(0, 6);
}

// ── Sub-components ────────────────────────────────────────────────────────────

export function AppButton({ appKey, onPress }: { appKey: string; onPress?: () => void }) {
  const app = APPS[appKey];
  if (!app) return null;
  return (
    <TouchableOpacity
      style={[styles.appBtn, { borderColor: `${app.color}40`, backgroundColor: `${app.color}18` }]}
      onPress={onPress ?? (() => openApp(appKey))}
      activeOpacity={0.75}
    >
      <Text style={styles.appEmoji}>{app.emoji}</Text>
      <Text style={[styles.appLabel, { color: app.color === "#010101" || app.color === "#000000" ? "#888" : app.color }]}>{app.label}</Text>
    </TouchableOpacity>
  );
}

export function AppButtonRow({ appKeys, label }: { appKeys: string[]; label?: string }) {
  const c = useColors();
  if (appKeys.length === 0) return null;
  return (
    <View style={styles.appRow}>
      {label && <Text style={[styles.appRowLabel, { color: c.mutedForeground }]}>{label}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {appKeys.map((k) => <AppButton key={k} appKey={k} />)}
      </ScrollView>
    </View>
  );
}

// ── Analysis result types ─────────────────────────────────────────────────────

interface AnalyzeResult {
  context: string;
  detected: string[];
  summary: string;
  risks: string[];
  opportunities: string[];
  actions: string[];
  apps: string[];
}

// ── Main Sheet ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function EmmaSeesSheet({ visible, onClose }: Props) {
  const c = useColors();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const showResult = useCallback((r: AnalyzeResult) => {
    setResult(r);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const handleAnalyze = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    fadeAnim.setValue(0);
    try {
      const resp = await fetch(`${BASE}/pathfinder/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (resp.ok) {
        const data = await resp.json() as AnalyzeResult;
        showResult(data);
      }
    } catch { /**/ }
    setLoading(false);
  }, [text, showResult, fadeAnim]);

  const handleClose = () => {
    setText("");
    setResult(null);
    fadeAnim.setValue(0);
    onClose();
  };

  const handleCreateMission = () => {
    handleClose();
    router.push("/pathfinder");
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <LinearGradient
        colors={isDark ? ["#0B0718", "#07050F"] as const : ["#F5F0FF", "#EDE8FA"] as const}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={handleClose} style={styles.iconBtn}>
            <Feather name="x" size={20} color={c.foreground} />
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={[styles.headerTitle, { color: c.foreground }]}>Emma Sees</Text>
            <Text style={[styles.headerSub, { color: c.mutedForeground }]}>Paste what's on your screen</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Instruction */}
          <View style={[styles.instructionBox, { backgroundColor: "#a855f715", borderColor: "#a855f730" }]}>
            <Text style={{ fontSize: 20, marginBottom: 4 }}>👁️</Text>
            <Text style={[styles.instructionText, { color: c.foreground }]}>
              Copy text from any screen — a document, email, product page, or meeting notes — and paste it here. Emma will analyze the context and suggest actions.
            </Text>
          </View>

          {/* Text input */}
          <TextInput
            style={[styles.textArea, { backgroundColor: c.card, borderColor: result ? "#a855f760" : c.border, color: c.foreground }]}
            value={text}
            onChangeText={(t) => { setText(t); if (result) setResult(null); }}
            placeholder={"Paste anything here:\n• Meeting notes\n• Product page\n• Email thread\n• Document excerpt\n• App screen text\n..."}
            placeholderTextColor={c.mutedForeground}
            multiline
            textAlignVertical="top"
          />

          {/* Analyze button */}
          <TouchableOpacity
            style={[styles.analyzeBtn, (!text.trim() || loading) && { opacity: 0.5 }]}
            onPress={() => { void handleAnalyze(); }}
            disabled={!text.trim() || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Feather name="eye" size={17} color="#fff" />
                  <Text style={styles.analyzeBtnText}>Analyze with Emma</Text>
                </>
            }
          </TouchableOpacity>

          {/* Loading placeholder */}
          {loading && (
            <View style={[styles.resultCard, { backgroundColor: c.card, borderColor: "#a855f740" }]}>
              <ActivityIndicator color="#a855f7" size="small" />
              <Text style={[{ color: c.mutedForeground, fontSize: 14, marginTop: 10, textAlign: "center" }]}>
                Emma is reading the context...
              </Text>
            </View>
          )}

          {/* Result */}
          {result && (
            <Animated.View style={{ opacity: fadeAnim }}>
              {/* Context header */}
              <View style={[styles.resultCard, { backgroundColor: c.card, borderColor: "#a855f740" }]}>
                <View style={styles.contextHeader}>
                  <View style={[styles.contextBadge, { backgroundColor: "#a855f720" }]}>
                    <Text style={{ color: "#a855f7", fontSize: 12, fontWeight: "700" }}>EMMA SEES</Text>
                  </View>
                  <Text style={[styles.contextTitle, { color: c.foreground }]}>{result.context}</Text>
                </View>
                <Text style={[styles.summaryText, { color: c.mutedForeground }]}>{result.summary}</Text>
              </View>

              {/* Suggested actions */}
              {result.actions.length > 0 && (
                <View style={[styles.resultCard, { backgroundColor: c.card, borderColor: "#22c55e40" }]}>
                  <Text style={[styles.sectionLabel, { color: "#22c55e" }]}>⚡ Suggested Actions</Text>
                  {result.actions.map((a, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: "#22c55e" }]} />
                      <Text style={[styles.bulletText, { color: c.foreground }]}>{a}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Risks */}
              {result.risks.length > 0 && (
                <View style={[styles.resultCard, { backgroundColor: c.card, borderColor: "#ef444440" }]}>
                  <Text style={[styles.sectionLabel, { color: "#ef4444" }]}>⚠️ Risks</Text>
                  {result.risks.map((r, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: "#ef4444" }]} />
                      <Text style={[styles.bulletText, { color: c.foreground }]}>{r}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Opportunities */}
              {result.opportunities.length > 0 && (
                <View style={[styles.resultCard, { backgroundColor: c.card, borderColor: "#a855f740" }]}>
                  <Text style={[styles.sectionLabel, { color: "#a855f7" }]}>🚀 Opportunities</Text>
                  {result.opportunities.map((o, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: "#a855f7" }]} />
                      <Text style={[styles.bulletText, { color: c.foreground }]}>{o}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Open apps */}
              {result.apps.length > 0 && (
                <View style={[styles.resultCard, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Text style={[styles.sectionLabel, { color: c.foreground }]}>📲 Open in...</Text>
                  <View style={styles.appsGrid}>
                    {result.apps.map((key) => {
                      const app = APPS[key];
                      if (!app) return null;
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[styles.appBtnLarge, { borderColor: `${app.color}40`, backgroundColor: `${app.color}15` }]}
                          onPress={() => { void openApp(key); }}
                          activeOpacity={0.75}
                        >
                          <Text style={{ fontSize: 26 }}>{app.emoji}</Text>
                          <Text style={[styles.appLabelLarge, { color: c.foreground }]}>{app.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Save to Pathfinder */}
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreateMission}>
                <Feather name="compass" size={16} color="#a855f7" />
                <Text style={styles.saveBtnText}>Turn into a Pathfinder Mission</Text>
                <Feather name="chevron-right" size={14} color="#a855f7" />
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  headerSub: { fontSize: 12, marginTop: 1 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  instructionBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  instructionText: { flex: 1, fontSize: 13, lineHeight: 19 },
  textArea: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 14, lineHeight: 21, height: 160, marginBottom: 14 },
  analyzeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#a855f7", borderRadius: 14, paddingVertical: 14, marginBottom: 20 },
  analyzeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  resultCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  contextHeader: { marginBottom: 8 },
  contextBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 6 },
  contextTitle: { fontSize: 16, fontWeight: "700" },
  summaryText: { fontSize: 14, lineHeight: 20 },
  sectionLabel: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  bulletText: { fontSize: 14, flex: 1, lineHeight: 20 },
  appsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  appBtnLarge: { width: "30%", alignItems: "center", padding: 12, borderRadius: 14, borderWidth: 1, gap: 6 },
  appLabelLarge: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderRadius: 14, backgroundColor: "#a855f715", borderWidth: 1, borderColor: "#a855f740", marginTop: 4 },
  saveBtnText: { flex: 1, color: "#a855f7", fontSize: 14, fontWeight: "600" },
  appRow: { marginTop: 8 },
  appRowLabel: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
  appBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  appEmoji: { fontSize: 14 },
  appLabel: { fontSize: 13, fontWeight: "600" },
});
