import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PresentationResult {
  title: string;
  slideCount: number;
  theme: string;
  filename: string;
  file: string;
  format?: "pptx" | "html";
  imagesUsed?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const THEMES = [
  { key: "professional", label: "Professional", emoji: "🌌", desc: "Dark purple — Emperial" },
  { key: "ocean",        label: "Ocean",         emoji: "🌊", desc: "Deep blue-cyan · Card layout" },
  { key: "forest",       label: "Forest",        emoji: "🌿", desc: "Dark green · Sidebar" },
  { key: "ember",        label: "Ember",         emoji: "🔥", desc: "Warm orange · Bold border" },
  { key: "clean",        label: "Clean",         emoji: "☁️",  desc: "Light minimal" },
];

const PRESET_COUNTS = [6, 8, 10, 12, 16, 20, 30];

const QUICK_TOPICS = [
  "Product launch strategy",
  "Company quarterly review",
  "Market analysis & trends",
  "Project roadmap",
  "Investment pitch deck",
  "Team performance review",
];

// ── Slide count picker ────────────────────────────────────────────────────────

function SlideCountPicker({ value, onChange, c }: {
  value: number;
  onChange: (n: number) => void;
  c: ReturnType<typeof useColors>;
}) {
  const [showCustom, setShowCustom] = useState(!PRESET_COUNTS.includes(value));
  const [customText, setCustomText] = useState(PRESET_COUNTS.includes(value) ? "" : String(value));
  const customRef = useRef<TextInput>(null);

  const pickPreset = (n: number) => { onChange(n); setShowCustom(false); setCustomText(""); };
  const activateCustom = () => {
    setShowCustom(true);
    setCustomText(PRESET_COUNTS.includes(value) ? "" : String(value));
    setTimeout(() => customRef.current?.focus(), 80);
  };
  const handleCustomChange = (t: string) => {
    setCustomText(t);
    const n = parseInt(t, 10);
    if (!isNaN(n) && n >= 4 && n <= 100) onChange(n);
  };

  const currentIsCustom = showCustom && !PRESET_COUNTS.includes(value);

  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {PRESET_COUNTS.map((n) => {
          const active = !showCustom && value === n;
          return (
            <TouchableOpacity
              key={n}
              style={[styles.countChip, { borderColor: active ? "#a855f7" : c.border, backgroundColor: active ? "#a855f720" : "transparent" }]}
              onPress={() => pickPreset(n)}
            >
              <Text style={{ color: active ? "#a855f7" : c.mutedForeground, fontSize: 14, fontWeight: "600" }}>{n}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.countChip, { borderColor: currentIsCustom ? "#a855f7" : c.border, backgroundColor: currentIsCustom ? "#a855f720" : "transparent", paddingHorizontal: 12, width: "auto" as unknown as number }]}
          onPress={activateCustom}
        >
          <Feather name="edit-2" size={12} color={currentIsCustom ? "#a855f7" : c.mutedForeground} />
          <Text style={{ color: currentIsCustom ? "#a855f7" : c.mutedForeground, fontSize: 13, fontWeight: "600", marginLeft: 4 }}>Custom</Text>
        </TouchableOpacity>
      </ScrollView>

      {showCustom && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TextInput
            ref={customRef}
            style={[styles.customCountInput, { backgroundColor: c.card, borderColor: "#a855f7", color: c.foreground }]}
            value={customText}
            onChangeText={handleCustomChange}
            placeholder="e.g. 25"
            placeholderTextColor={c.mutedForeground}
            keyboardType="number-pad"
            maxLength={3}
          />
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
            slides{value >= 4 && !PRESET_COUNTS.includes(value) ? ` (${value})` : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Theme picker ──────────────────────────────────────────────────────────────

function ThemePicker({ value, onChange, c }: {
  value: string;
  onChange: (k: string) => void;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {THEMES.map((t) => (
        <TouchableOpacity
          key={t.key}
          style={[styles.themeChip, { borderColor: value === t.key ? "#a855f7" : c.border, backgroundColor: value === t.key ? "#a855f715" : c.card }]}
          onPress={() => onChange(t.key)}
          activeOpacity={0.75}
        >
          <Text style={{ fontSize: 20 }}>{t.emoji}</Text>
          <View style={{ marginLeft: 8 }}>
            <Text style={{ color: value === t.key ? "#a855f7" : c.foreground, fontSize: 13, fontWeight: "700" }}>{t.label}</Text>
            <Text style={{ color: c.mutedForeground, fontSize: 11 }}>{t.desc}</Text>
          </View>
          {value === t.key && (
            <View style={styles.themeCheck}>
              <Feather name="check" size={11} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── Format picker ─────────────────────────────────────────────────────────────

function FormatPicker({ value, onChange, c }: {
  value: "pptx" | "html";
  onChange: (f: "pptx" | "html") => void;
  c: ReturnType<typeof useColors>;
}) {
  const options: Array<{ key: "pptx" | "html"; emoji: string; label: string; sub: string }> = [
    { key: "pptx", emoji: "📊", label: "PowerPoint", sub: ".pptx · Edit in Keynote, Slides" },
    { key: "html", emoji: "✨", label: "Animated Web", sub: ".html · 3D · Apple-style motion" },
  ];
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            style={[styles.formatCard, { borderColor: active ? "#a855f7" : c.border, backgroundColor: active ? "#a855f712" : c.card, flex: 1 }]}
            onPress={() => onChange(o.key)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 26, marginBottom: 6 }}>{o.emoji}</Text>
            <Text style={{ color: active ? "#a855f7" : c.foreground, fontSize: 14, fontWeight: "700" }}>{o.label}</Text>
            <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 3, lineHeight: 15 }}>{o.sub}</Text>
            {active && (
              <View style={[styles.themeCheck, { top: 8, right: 8 }]}>
                <Feather name="check" size={11} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({ label, description, value, onChange, c }: {
  label: string; description: string; value: boolean;
  onChange: (v: boolean) => void;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.toggleRow, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "600" }}>{label}</Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2, lineHeight: 16 }}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: c.border, true: "#a855f780" }}
        thumbColor={value ? "#a855f7" : c.mutedForeground}
        ios_backgroundColor={c.border}
      />
    </View>
  );
}

// ── Result view ───────────────────────────────────────────────────────────────

function ResultView({ result, onShare, onClose, onNew, c }: {
  result: PresentationResult;
  onShare: () => void;
  onClose: () => void;
  onNew: () => void;
  c: ReturnType<typeof useColors>;
}) {
  const theme = THEMES.find((t) => t.key === result.theme);
  const isHtml = result.format === "html";

  return (
    <View style={styles.resultWrap}>
      <View style={styles.resultIcon}>
        <LinearGradient colors={["#a855f7", "#7c3aed"]} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <Text style={{ fontSize: 28 }}>{isHtml ? "✨" : "📊"}</Text>
      </View>

      <Text style={[styles.resultTitle, { color: c.foreground }]}>{result.title}</Text>
      <Text style={[styles.resultMeta, { color: c.mutedForeground }]}>
        {result.slideCount} slides · {theme?.emoji} {theme?.label}
        {result.imagesUsed ? ` · ${result.imagesUsed} photo${result.imagesUsed !== 1 ? "s" : ""}` : ""}
        {isHtml ? " · Animated 3D" : ""}
      </Text>
      <Text style={[styles.resultFilename, { color: "#a855f7" }]}>{result.filename}</Text>

      {isHtml && (
        <View style={[styles.htmlNote, { backgroundColor: "#a855f710", borderColor: "#a855f730" }]}>
          <Feather name="info" size={13} color="#a855f7" style={{ marginRight: 6, marginTop: 1 }} />
          <Text style={{ color: c.mutedForeground, fontSize: 12, flex: 1, lineHeight: 17 }}>
            Tap <Text style={{ fontWeight: "700", color: c.foreground }}>Share / Open</Text> and choose Safari or Chrome to view your animated presentation with 3D effects.
          </Text>
        </View>
      )}

      <View style={styles.resultBtns}>
        <TouchableOpacity style={styles.shareBtn} onPress={onShare}>
          <Feather name={isHtml ? "globe" : "share-2"} size={18} color="#fff" />
          <Text style={styles.shareBtnText}>{isHtml ? "Share / Open in Browser" : "Share / Open in…"}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity style={[styles.secondaryBtn, { borderColor: c.border }]} onPress={onNew}>
            <Feather name="plus" size={15} color={c.mutedForeground} />
            <Text style={[styles.secondaryBtnText, { color: c.mutedForeground }]}>New</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, { borderColor: c.border }]} onPress={onClose}>
            <Text style={[styles.secondaryBtnText, { color: c.mutedForeground }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Main Sheet ────────────────────────────────────────────────────────────────

interface PresentationSheetProps {
  visible: boolean;
  initialTopic?: string;
  onClose: () => void;
}

export function PresentationSheet({ visible, initialTopic = "", onClose }: PresentationSheetProps) {
  const c = useColors();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const insets = useSafeAreaInsets();

  const [topic, setTopic] = useState(initialTopic);
  const [context, setContext] = useState("");
  const [theme, setTheme] = useState("professional");
  const [numSlides, setNumSlides] = useState(8);
  const [useImages, setUseImages] = useState(false);
  const [format, setFormat] = useState<"pptx" | "html">("pptx");
  const [enable3D, setEnable3D] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<PresentationResult | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);

  useEffect(() => { if (initialTopic) setTopic(initialTopic); }, [initialTopic]);

  const reset = useCallback(() => {
    setTopic(initialTopic);
    setContext("");
    setTheme("professional");
    setNumSlides(8);
    setUseImages(false);
    setFormat("pptx");
    setEnable3D(false);
    setResult(null);
    setLocalPath(null);
    setProgress("");
  }, [initialTopic]);

  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setProgress(format === "html" ? "Composing animated slides…" : "Generating slide content…");

    try {
      const resp = await fetch(`${BASE}/emma/presentation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          style: theme,
          numSlides,
          context: context.trim() || undefined,
          useImages: format === "pptx" ? useImages : false,
          format,
          enable3D: format === "html" ? enable3D : false,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json() as { error?: string };
        setProgress(`Error: ${err.error ?? "Generation failed"}`);
        setLoading(false);
        return;
      }

      setProgress("Building file…");
      const data = await resp.json() as PresentationResult;
      setResult(data);

      if (Platform.OS !== "web") {
        const dir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory ?? "";
        const path = `${dir}${data.filename}`;
        await FileSystem.writeAsStringAsync(path, data.file, { encoding: "base64" as any });
        setLocalPath(path);
      }

      setProgress("");
    } catch {
      setProgress("Something went wrong. Please try again.");
    }
    setLoading(false);
  }, [topic, theme, numSlides, context, useImages, format, enable3D, loading]);

  const handleShare = useCallback(async () => {
    if (!result) return;
    const isHtml = result.format === "html";
    const mimeType = isHtml
      ? "text/html"
      : "application/vnd.openxmlformats-officedocument.presentationml.presentation";

    if (Platform.OS === "web") {
      const link = document.createElement("a");
      link.href = `data:${mimeType};base64,${result.file}`;
      link.download = result.filename;
      link.click();
      return;
    }

    const dir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory ?? "";
    const path = localPath ?? `${dir}${result.filename}`;
    if (!localPath) {
      await FileSystem.writeAsStringAsync(path, result.file, { encoding: "base64" as any });
      setLocalPath(path);
    }

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(path, {
        mimeType,
        dialogTitle: `Share "${result.title}"`,
        UTI: isHtml ? "public.html" : "com.microsoft.powerpoint.pptx",
      });
    } else if (isHtml) {
      // Fallback: open file directly
      await Linking.openURL(`file://${path}`);
    }
  }, [result, localPath]);

  const isHtmlFormat = format === "html";
  const estimatedSecs = isHtmlFormat
    ? Math.max(10, numSlides * 0.9)
    : useImages
    ? Math.max(15, numSlides * 1.8)
    : Math.max(8, numSlides * 0.8);
  const timeHint = estimatedSecs < 60 ? `~${Math.round(estimatedSecs)}s` : `~${Math.round(estimatedSecs / 60)}m`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient
        colors={isDark ? ["#0B0718", "#07050F"] as const : ["#F5F0FF", "#EDE8FA"] as const}
        style={{ flex: 1 }}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Feather name="x" size={20} color={c.foreground} />
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={[styles.headerTitle, { color: c.foreground }]}>Create Presentation</Text>
            <Text style={[styles.headerSub, { color: c.mutedForeground }]}>AI-generated · PowerPoint, Keynote, Slides</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {result ? (
            <ResultView result={result} onShare={handleShare} onClose={onClose} onNew={reset} c={c} />
          ) : (
            <>
              {/* Topic */}
              <Text style={[styles.label, { color: c.foreground }]}>What's your presentation about? *</Text>
              <TextInput
                style={[styles.topicInput, { backgroundColor: c.card, borderColor: topic.trim() ? "#a855f7" : c.border, color: c.foreground }]}
                value={topic}
                onChangeText={setTopic}
                placeholder="e.g. Q3 strategy review, investor pitch, product launch…"
                placeholderTextColor={c.mutedForeground}
                returnKeyType="done"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 8 }}>
                {QUICK_TOPICS.map((qt) => (
                  <TouchableOpacity key={qt} style={[styles.quickChip, { borderColor: c.border, backgroundColor: c.card }]} onPress={() => setTopic(qt)} activeOpacity={0.7}>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{qt}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Context */}
              <Text style={[styles.label, { color: c.foreground, marginTop: 20 }]}>Additional context (optional)</Text>
              <TextInput
                style={[styles.contextInput, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]}
                value={context}
                onChangeText={setContext}
                placeholder="Key points, audience, tone, data to include…"
                placeholderTextColor={c.mutedForeground}
                multiline
                textAlignVertical="top"
              />

              {/* Format */}
              <Text style={[styles.label, { color: c.foreground, marginTop: 20 }]}>Format</Text>
              <FormatPicker value={format} onChange={setFormat} c={c} />

              {/* Theme */}
              <Text style={[styles.label, { color: c.foreground, marginTop: 20 }]}>Theme</Text>
              <ThemePicker value={theme} onChange={setTheme} c={c} />

              {/* Slide count */}
              <Text style={[styles.label, { color: c.foreground, marginTop: 20 }]}>Number of slides</Text>
              <SlideCountPicker value={numSlides} onChange={setNumSlides} c={c} />

              {/* Options */}
              <Text style={[styles.label, { color: c.foreground, marginTop: 20 }]}>Options</Text>

              {isHtmlFormat ? (
                <ToggleRow
                  label="Enable 3D graphics"
                  description="Fibonacci particle sphere + orbital rings animate behind every slide via Three.js"
                  value={enable3D}
                  onChange={setEnable3D}
                  c={c}
                />
              ) : (
                <ToggleRow
                  label="Include photos"
                  description="Emma finds relevant web images and places them on content slides"
                  value={useImages}
                  onChange={setUseImages}
                  c={c}
                />
              )}

              <Text style={[styles.timeHint, { color: c.mutedForeground }]}>
                Estimated time: {timeHint}
                {isHtmlFormat && enable3D ? " · includes Three.js 3D" : ""}
                {!isHtmlFormat && useImages ? " · includes photo search" : ""}
              </Text>

              {progress !== "" && (
                <View style={[styles.progressBar, { backgroundColor: c.card, borderColor: c.border }]}>
                  {loading && <ActivityIndicator size="small" color="#a855f7" style={{ marginRight: 8 }} />}
                  <Text style={{ color: loading ? "#a855f7" : "#ef4444", fontSize: 13 }}>{progress}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.generateBtn, (!topic.trim() || loading) && { opacity: 0.5 }]}
                onPress={() => { void handleGenerate(); }}
                disabled={!topic.trim() || loading}
                activeOpacity={0.8}
              >
                <LinearGradient colors={["#a855f7", "#7c3aed"]} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                {loading ? (
                  <>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.generateBtnText}>{progress || "Generating…"}</Text>
                  </>
                ) : (
                  <>
                    <Feather name={isHtmlFormat ? "zap" : "layers"} size={18} color="#fff" />
                    <Text style={styles.generateBtnText}>
                      {isHtmlFormat
                        ? `Generate ${numSlides} Animated Slides${enable3D ? " + 3D" : ""}`
                        : `Generate ${numSlides} Slides${useImages ? " + Photos" : ""}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={[styles.footer, { color: c.mutedForeground }]}>
                {isHtmlFormat
                  ? "Animated format opens in Safari or Chrome with smooth transitions, 3D effects, and click-through bullets."
                  : "Emma builds a real .pptx file you can edit in PowerPoint, Google Slides, or Keynote."}
              </Text>
            </>
          )}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  headerSub: { fontSize: 11, marginTop: 2, textAlign: "center" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  topicInput: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  quickChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  contextInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, height: 80 },
  formatCard: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, alignItems: "flex-start", position: "relative" },
  countChip: { borderWidth: 1.5, borderRadius: 10, width: 46, height: 40, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  customCountInput: { borderWidth: 1.5, borderRadius: 10, width: 72, height: 40, paddingHorizontal: 12, fontSize: 15, fontWeight: "600", textAlign: "center" },
  themeChip: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, minWidth: 175, position: "relative" },
  themeCheck: { position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: "#a855f7", alignItems: "center", justifyContent: "center" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  timeHint: { fontSize: 12, marginTop: 10, marginBottom: 4 },
  progressBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 16 },
  generateBtn: { overflow: "hidden", borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, marginTop: 20 },
  generateBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  footer: { fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 18 },
  resultWrap: { alignItems: "center", paddingVertical: 16 },
  resultIcon: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 20 },
  resultTitle: { fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  resultMeta: { fontSize: 14, textAlign: "center", marginBottom: 4 },
  resultFilename: { fontSize: 13, fontWeight: "600", marginBottom: 16 },
  htmlNote: { flexDirection: "row", alignItems: "flex-start", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 20, marginHorizontal: 4 },
  resultBtns: { width: "100%", gap: 12, alignItems: "center" },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#a855f7", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  shareBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  secondaryBtnText: { fontSize: 14, fontWeight: "600" },
});
