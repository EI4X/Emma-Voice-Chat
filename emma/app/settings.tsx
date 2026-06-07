import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChatContext } from "@/context/ChatContext";
import { useLocale, SUPPORTED_LANGUAGES } from "@/context/LocaleContext";
import { useTheme, ThemePreference } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";

const THEME_OPTIONS: { id: ThemePreference; label: string; icon: string }[] = [
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "light", label: "Light", icon: "sun" },
  { id: "system", label: "System", icon: "monitor" },
];

const CAPABILITIES = [
  { icon: "cpu", label: "Deep Reasoning", desc: "Multi-step analytical thinking" },
  { icon: "globe", label: "Live Research", desc: "Real-time web access" },
  { icon: "mic", label: "Voice Mode", desc: "Natural speech interaction" },
  { icon: "image", label: "Vision", desc: "Image & document analysis" },
] as const;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const { resolvedTheme, preference: themePref, setPreference: setThemePref } = useTheme();
  const { conversations, deleteConversation, incognito, setIncognito } = useChatContext();
  const { activeLanguage, overrideLanguage, detectedLocale, setOverrideLanguage, isLoading } = useLocale();

  const [langPickerVisible, setLangPickerVisible] = useState(false);

  const isDark = resolvedTheme === "dark";

  const handleClearAll = () => {
    if (Platform.OS === "web") {
      if (confirm("Delete all conversations? This cannot be undone.")) {
        conversations.forEach((conv) => deleteConversation(conv.id));
      }
    } else {
      Alert.alert("Clear All Chats", "This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => conversations.forEach((conv) => deleteConversation(conv.id)),
        },
      ]);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={c.foreground} />
        </TouchableOpacity>
        <Text style={[styles.topLabel, { color: c.mutedForeground }]}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero brand block ── */}
        <View style={[styles.heroCard, { borderColor: c.border }]}>
          <LinearGradient
            colors={
              isDark
                ? ["#ffffff10", "#ffffff06", "transparent"]
                : ["#00000008", "#00000003", "transparent"]
            }
            style={styles.heroGradient}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          >
            <View style={styles.heroInner}>
              <View style={styles.avatarWrap}>
                <View style={[styles.avatarRing, { borderColor: `${c.foreground}20` }]} />
                <View style={[styles.avatarRingOuter, { borderColor: `${c.foreground}0a` }]} />
                <View style={[styles.avatar, { backgroundColor: c.secondary, borderColor: c.border }]}>
                  <Text style={[styles.avatarLetter, { color: c.foreground }]}>E</Text>
                </View>
              </View>
              <Text style={[styles.heroName, { color: c.foreground }]}>Emma</Text>
              <Text style={[styles.heroMaker, { color: c.mutedForeground }]}>
                by Emperial Intelligence
              </Text>
              <View style={[styles.onlineBadge, { backgroundColor: c.secondary, borderColor: c.border }]}>
                <View style={styles.onlineDot} />
                <Text style={[styles.onlineText, { color: c.mutedForeground }]}>Online</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── Capabilities ── */}
        <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>CAPABILITIES</Text>
        <View style={styles.capsGrid}>
          {CAPABILITIES.map((cap) => (
            <View
              key={cap.label}
              style={[styles.capCard, { backgroundColor: c.card, borderColor: c.border }]}
            >
              <View style={[styles.capIconWrap, { backgroundColor: c.secondary, borderColor: c.border }]}>
                <Feather name={cap.icon as any} size={14} color={c.foreground} />
              </View>
              <Text style={[styles.capLabel, { color: c.foreground }]}>{cap.label}</Text>
              <Text style={[styles.capDesc, { color: c.mutedForeground }]}>{cap.desc}</Text>
            </View>
          ))}
        </View>

        {/* ── Privacy ── */}
        <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>PRIVACY</Text>
        <View style={[styles.section, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowIcon, { backgroundColor: c.secondary }]}>
                <Feather name="eye-off" size={14} color={c.mutedForeground} />
              </View>
              <View>
                <Text style={[styles.rowLabel, { color: c.foreground }]}>Incognito Mode</Text>
                <Text style={[styles.rowDesc, { color: c.mutedForeground }]}>
                  Chats won't be saved or synced
                </Text>
              </View>
            </View>
            <Switch
              value={incognito}
              onValueChange={setIncognito}
              trackColor={{ false: c.secondary, true: c.foreground }}
              thumbColor={incognito ? c.background : c.mutedForeground}
            />
          </View>
        </View>

        {/* ── Appearance ── */}
        <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>APPEARANCE</Text>
        <View style={[styles.section, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.row, { paddingBottom: 8 }]}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowIcon, { backgroundColor: c.secondary }]}>
                <Feather name="droplet" size={14} color={c.mutedForeground} />
              </View>
              <Text style={[styles.rowLabel, { color: c.foreground }]}>Theme</Text>
            </View>
          </View>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const active = themePref === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.themeBtn,
                    {
                      backgroundColor: active ? c.foreground : c.secondary,
                      borderColor: active ? c.foreground : c.border,
                    },
                  ]}
                  onPress={() => setThemePref(opt.id)}
                  activeOpacity={0.75}
                >
                  <Feather
                    name={opt.icon as any}
                    size={13}
                    color={active ? c.background : c.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.themeBtnText,
                      { color: active ? c.background : c.mutedForeground },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <TouchableOpacity style={styles.row} onPress={() => setLangPickerVisible(true)}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowIcon, { backgroundColor: c.secondary }]}>
                <Feather name="globe" size={14} color={c.mutedForeground} />
              </View>
              <View>
                <Text style={[styles.rowLabel, { color: c.foreground }]}>Language</Text>
                {!overrideLanguage && detectedLocale && detectedLocale.code !== "en" && (
                  <Text style={[styles.rowDesc, { color: c.mutedForeground }]}>
                    Auto-detected from {detectedLocale.country}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: c.mutedForeground }]}>
                {isLoading ? "Detecting…" : (SUPPORTED_LANGUAGES.find(l => l.name === activeLanguage)?.flag ?? "🌐") + " " + activeLanguage}
              </Text>
              <Feather name="chevron-right" size={14} color={c.mutedForeground} />
            </View>
          </TouchableOpacity>

          {/* Language picker modal */}
          <Modal
            visible={langPickerVisible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setLangPickerVisible(false)}
          >
            <View style={[styles.pickerContainer, { backgroundColor: c.background }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: c.border }]}>
                <Text style={[styles.pickerTitle, { color: c.foreground }]}>Language</Text>
                <TouchableOpacity onPress={() => setLangPickerVisible(false)}>
                  <Feather name="x" size={20} color={c.mutedForeground} />
                </TouchableOpacity>
              </View>
              {detectedLocale && (
                <View style={[styles.pickerDetected, { backgroundColor: c.secondary, borderColor: c.border }]}>
                  <Feather name="map-pin" size={12} color={c.mutedForeground} style={{ marginRight: 6 }} />
                  <Text style={[styles.pickerDetectedText, { color: c.mutedForeground }]}>
                    Detected: {SUPPORTED_LANGUAGES.find(l => l.code === detectedLocale.code)?.flag ?? "🌐"} {detectedLocale.name} ({detectedLocale.country})
                  </Text>
                </View>
              )}
              {overrideLanguage && (
                <TouchableOpacity
                  style={[styles.pickerReset, { borderColor: c.border }]}
                  onPress={() => { setOverrideLanguage(null); setLangPickerVisible(false); }}
                >
                  <Feather name="rotate-ccw" size={13} color={c.mutedForeground} />
                  <Text style={[styles.pickerResetText, { color: c.mutedForeground }]}>
                    Reset to auto-detected
                  </Text>
                </TouchableOpacity>
              )}
              <FlatList
                data={SUPPORTED_LANGUAGES}
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => {
                  const selected = item.name === activeLanguage;
                  return (
                    <TouchableOpacity
                      style={[styles.langItem, { borderBottomColor: c.border }]}
                      onPress={() => {
                        setOverrideLanguage(item.name);
                        setLangPickerVisible(false);
                      }}
                    >
                      <Text style={styles.langFlag}>{item.flag}</Text>
                      <Text style={[styles.langName, { color: c.foreground }]}>{item.name}</Text>
                      {selected && <Feather name="check" size={16} color={c.primary} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </Modal>
        </View>

        {/* ── Data ── */}
        <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>DATA</Text>
        <View style={[styles.section, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowIcon, { backgroundColor: c.secondary }]}>
                <Feather name="message-square" size={14} color={c.mutedForeground} />
              </View>
              <View>
                <Text style={[styles.rowLabel, { color: c.foreground }]}>Conversations</Text>
                <Text style={[styles.rowDesc, { color: c.mutedForeground }]}>
                  {conversations.length} saved chat{conversations.length !== 1 ? "s" : ""}
                </Text>
              </View>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <TouchableOpacity style={styles.row} onPress={handleClearAll}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowIcon, { backgroundColor: `${c.destructive}18` }]}>
                <Feather name="trash-2" size={14} color={c.destructive} />
              </View>
              <Text style={[styles.rowLabel, { color: c.destructive }]}>Clear All Chats</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={[styles.footerBrand, { color: c.mutedForeground }]}>
            EMPERIAL INTELLIGENCE
          </Text>
          <Text style={[styles.footerVersion, { color: c.mutedForeground }]}>Emma · v1.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  topLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 6 },

  // ── Hero ──
  heroCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 20,
  },
  heroGradient: { width: "100%" },
  heroInner: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 28,
    gap: 5,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  avatarRing: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarRingOuter: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  avatarLetter: { fontSize: 24, fontWeight: "700" as const },
  heroName: { fontSize: 30, fontWeight: "700" as const, letterSpacing: -0.5, marginTop: 2 },
  heroMaker: { fontSize: 13, letterSpacing: 0.2 },
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ade80" },
  onlineText: { fontSize: 12, fontWeight: "500" as const },

  // ── Caps grid ──
  capsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  capCard: {
    width: "47.5%",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
  },
  capIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  capLabel: { fontSize: 13, fontWeight: "600" as const, marginTop: 2 },
  capDesc: { fontSize: 11, lineHeight: 16 },

  // ── Settings sections ──
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 0.8,
    paddingHorizontal: 2,
    marginTop: 8,
    marginBottom: 6,
  },
  section: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    gap: 12,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 15 },
  rowDesc: { fontSize: 12, marginTop: 1 },
  rowValue: { fontSize: 14 },
  themeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  themeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  themeBtnText: { fontSize: 12, fontWeight: "500" as const },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },

  // ── Language picker ──
  pickerContainer: { flex: 1 },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerTitle: { fontSize: 17, fontWeight: "600" as const },
  pickerDetected: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerDetectedText: { fontSize: 13 },
  pickerReset: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerResetText: { fontSize: 14 },
  langItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  langFlag: { fontSize: 24 },
  langName: { flex: 1, fontSize: 16 },

  // ── Footer ──
  footer: { alignItems: "center", marginTop: 36, gap: 4 },
  footerBrand: { fontSize: 10, letterSpacing: 1.8, fontWeight: "600" as const },
  footerVersion: { fontSize: 12 },
});
