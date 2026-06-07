import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
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
import {
  type ContextProfile,
  type Mission,
  type Observation,
  usePathfinder,
} from "@/context/PathfinderContext";
import { AppButton } from "@/components/EmmaSeesSheet";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["general", "funding", "presentation", "research", "meeting", "project", "travel", "campaign", "launch"];
const PRIORITIES = ["high", "medium", "low"] as const;
const PRIORITY_COLOR: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };
const CATEGORY_EMOJI: Record<string, string> = {
  general: "⚡", funding: "💰", presentation: "📊", research: "🔬",
  meeting: "🤝", project: "🚀", travel: "✈️", campaign: "📣", launch: "🎯",
};

const SOURCE_LABEL: Record<Observation["source"], string> = {
  chat: "from chat", manual: "manual feed", conference: "conference",
};

const BASE = typeof process !== "undefined" && process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "/api";

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function daysUntil(deadline?: string): number | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Pulse dot ─────────────────────────────────────────────────────────────────

function PulseRing() {
  const anim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return (
    <View style={{ width: 12, height: 12, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{
        position: "absolute", width: 12, height: 12, borderRadius: 6,
        borderWidth: 1.5, borderColor: "#a855f7",
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
      }} />
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#a855f7" }} />
    </View>
  );
}

// ── Observation Card ──────────────────────────────────────────────────────────

function ObservationCard({ obs, onDismiss, c }: {
  obs: Observation;
  onDismiss: () => void;
  c: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={[styles.obsCard, { backgroundColor: c.card, borderColor: "#a855f730" }]}>
      {/* Card header */}
      <View style={styles.obsCardHeader}>
        <View style={[styles.obsSourceBadge, { backgroundColor: "#a855f718" }]}>
          <Text style={{ color: "#a855f7", fontSize: 11, fontWeight: "700" }}>DETECTED</Text>
        </View>
        <Text style={[styles.obsTime, { color: c.mutedForeground }]}>{timeAgo(obs.timestamp)} · {SOURCE_LABEL[obs.source]}</Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={14} color={c.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Context title */}
      <TouchableOpacity onPress={() => setExpanded((e) => !e)} activeOpacity={0.7}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Text style={[styles.obsContext, { color: c.foreground }]}>{obs.context}</Text>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={c.mutedForeground} />
        </View>
        <Text style={[styles.obsSummary, { color: c.mutedForeground }]} numberOfLines={expanded ? undefined : 2}>{obs.summary}</Text>
      </TouchableOpacity>

      {expanded && (
        <>
          {/* Risks */}
          {obs.risks.length > 0 && (
            <View style={[styles.obsSection, { borderColor: "#ef444430", backgroundColor: "#ef444408" }]}>
              <Text style={[styles.obsSectionLabel, { color: "#ef4444" }]}>⚠️  Risk detected</Text>
              {obs.risks.map((r, i) => (
                <Text key={i} style={[styles.obsBullet, { color: c.foreground }]}>• {r}</Text>
              ))}
            </View>
          )}

          {/* Opportunities */}
          {obs.opportunities.length > 0 && (
            <View style={[styles.obsSection, { borderColor: "#a855f730", backgroundColor: "#a855f708" }]}>
              <Text style={[styles.obsSectionLabel, { color: "#a855f7" }]}>🚀  Opportunity</Text>
              {obs.opportunities.map((o, i) => (
                <Text key={i} style={[styles.obsBullet, { color: c.foreground }]}>• {o}</Text>
              ))}
            </View>
          )}

          {/* Prepared actions */}
          {obs.actions.length > 0 && (
            <View style={styles.obsPrepared}>
              <Text style={[styles.obsSectionLabel, { color: "#22c55e" }]}>⚡  Emma prepared</Text>
              {obs.actions.map((a, i) => (
                <View key={i} style={styles.obsActionRow}>
                  <View style={[styles.obsActionDot, { backgroundColor: "#22c55e" }]} />
                  <Text style={[styles.obsActionText, { color: c.foreground }]}>{a}</Text>
                </View>
              ))}
            </View>
          )}

          {/* App buttons */}
          {obs.apps.length > 0 && (
            <View style={styles.obsApps}>
              <Text style={[styles.obsAppsLabel, { color: c.mutedForeground }]}>Open in</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {obs.apps.map((key) => <AppButton key={key} appKey={key} />)}
              </ScrollView>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ── Context Feed Input ────────────────────────────────────────────────────────

function ContextFeedInput({ onAdd, c, isDark }: {
  onAdd: (obs: Omit<Observation, "id" | "timestamp">) => void;
  c: ReturnType<typeof useColors>;
  isDark: boolean;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    try {
      const resp = await fetch(`${BASE}/pathfinder/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (resp.ok) {
        const data = await resp.json() as {
          context: string; summary: string; detected: string[];
          risks: string[]; opportunities: string[]; actions: string[]; apps: string[];
        };
        onAdd({
          context: data.context,
          summary: data.summary,
          detected: data.detected,
          risks: data.risks,
          opportunities: data.opportunities,
          actions: data.actions,
          apps: data.apps,
          source: "manual",
        });
        setText("");
      }
    } catch { /**/ }
    setLoading(false);
  }, [text, loading, onAdd]);

  return (
    <View style={[styles.feedInput, { borderTopColor: c.border }]}>
      <TextInput
        style={[styles.feedInputText, { color: c.foreground, backgroundColor: c.card, borderColor: c.border }]}
        value={text}
        onChangeText={setText}
        placeholder="Paste anything for Emma to analyze…"
        placeholderTextColor={c.mutedForeground}
        multiline={false}
        returnKeyType="send"
        onSubmitEditing={() => { void handleSubmit(); }}
      />
      <TouchableOpacity
        style={[styles.feedInputBtn, (!text.trim() || loading) && { opacity: 0.4 }]}
        onPress={() => { void handleSubmit(); }}
        disabled={!text.trim() || loading}
      >
        {loading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Feather name="arrow-right" size={18} color="#fff" />
        }
      </TouchableOpacity>
    </View>
  );
}

// ── Mission helpers ───────────────────────────────────────────────────────────

function DeadlineBadge({ deadline, c }: { deadline?: string; c: ReturnType<typeof useColors> }) {
  const days = daysUntil(deadline);
  if (days === null) return null;
  const color = days <= 1 ? "#ef4444" : days <= 3 ? "#f59e0b" : c.mutedForeground;
  return (
    <Text style={{ fontSize: 11, color, fontWeight: "600" }}>
      {days <= 0 ? "Overdue" : days === 1 ? "Due tomorrow" : `${days}d left`}
    </Text>
  );
}

function MissionCard({ mission, onPress, onComplete, onDelete }: {
  mission: Mission;
  onPress: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const c = useColors();
  const completed = mission.status === "completed";
  const done = mission.steps?.filter((s) => s.completed).length ?? 0;
  const total = mission.steps?.length ?? 0;
  const pct = total > 0 ? done / total : 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={[styles.card, { backgroundColor: c.card, borderColor: c.border, opacity: completed ? 0.6 : 1 }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.categoryEmoji}>{CATEGORY_EMOJI[mission.category ?? "general"] ?? "⚡"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: c.foreground }]} numberOfLines={1}>{mission.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[mission.priority] ?? "#888" }]} />
              <Text style={[styles.cardMeta, { color: c.mutedForeground }]}>{mission.priority} · {mission.category}</Text>
              <DeadlineBadge deadline={mission.deadline} c={c} />
            </View>
          </View>
        </View>
        <View style={styles.cardActions}>
          {!completed && (
            <TouchableOpacity onPress={onComplete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
              <Feather name="check-circle" size={18} color="#22c55e" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
            <Feather name="trash-2" size={16} color={c.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>
      {total > 0 && (
        <View style={{ marginTop: 10 }}>
          <View style={[styles.progressTrack, { backgroundColor: c.secondary }]}>
            <View style={[styles.progressBar, { width: `${pct * 100}%`, backgroundColor: "#a855f7" }]} />
          </View>
          <Text style={[styles.progressLabel, { color: c.mutedForeground, marginTop: 4 }]}>{done}/{total} steps</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Mission Detail Modal ──────────────────────────────────────────────────────

function MissionDetail({ mission, onClose, onStepToggle }: {
  mission: Mission;
  onClose: () => void;
  onStepToggle: (stepId: number, completed: boolean) => void;
}) {
  const c = useColors();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const insets = useSafeAreaInsets();

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient
        colors={isDark ? ["#0B0718", "#07050F"] as const : ["#F5F0FF", "#EDE8FA"] as const}
        style={{ flex: 1 }}
      >
        <View style={[styles.detailHeader, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Feather name="x" size={20} color={c.foreground} />
          </TouchableOpacity>
          <Text style={[styles.detailTitle, { color: c.foreground }]} numberOfLines={1}>{mission.title}</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          {mission.description ? (
            <Text style={[styles.detailDesc, { color: c.mutedForeground }]}>{mission.description}</Text>
          ) : null}
          <Text style={[styles.sectionLabel, { color: c.foreground }]}>Steps</Text>
          {!mission.steps?.length ? (
            <Text style={[styles.emptyText, { color: c.mutedForeground }]}>No steps generated yet.</Text>
          ) : mission.steps.map((step) => (
            <TouchableOpacity
              key={step.id}
              style={[styles.stepRow, { borderBottomColor: c.border }]}
              onPress={() => onStepToggle(step.id, !step.completed)}
              activeOpacity={0.7}
            >
              <View style={[styles.stepCheck, { borderColor: step.completed ? "#a855f7" : c.border, backgroundColor: step.completed ? "#a855f7" : "transparent" }]}>
                {step.completed && <Feather name="check" size={12} color="#fff" />}
              </View>
              <Text style={[styles.stepText, { color: c.foreground, textDecorationLine: step.completed ? "line-through" : "none", opacity: step.completed ? 0.5 : 1 }]}>
                {step.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

// ── New Mission Modal ─────────────────────────────────────────────────────────

function NewMissionModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (title: string, desc: string, cat: string, prio: string, deadline?: string) => Promise<void>;
}) {
  const c = useColors();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    await onCreate(title.trim(), desc.trim(), category, priority, deadline.trim() || undefined);
    setLoading(false);
    onClose();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient
        colors={isDark ? ["#0B0718", "#07050F"] as const : ["#F5F0FF", "#EDE8FA"] as const}
        style={{ flex: 1 }}
      >
        <View style={[styles.detailHeader, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Feather name="x" size={20} color={c.foreground} />
          </TouchableOpacity>
          <Text style={[styles.detailTitle, { color: c.foreground }]}>New Mission</Text>
          <TouchableOpacity
            style={[styles.createBtn, (!title.trim() || loading) && { opacity: 0.5 }]}
            onPress={() => { void handleCreate(); }}
            disabled={!title.trim() || loading}
          >
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.createBtnText}>Create</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          <Text style={[styles.fieldLabel, { color: c.foreground }]}>Mission Title *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]}
            value={title} onChangeText={setTitle}
            placeholder="What do you want to accomplish?"
            placeholderTextColor={c.mutedForeground}
          />
          <Text style={[styles.fieldLabel, { color: c.foreground }]}>Description</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.foreground, height: 80 }]}
            value={desc} onChangeText={setDesc}
            placeholder="Details, context, goals…"
            placeholderTextColor={c.mutedForeground}
            multiline textAlignVertical="top"
          />
          <Text style={[styles.fieldLabel, { color: c.foreground }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat} onPress={() => setCategory(cat)}
                style={[styles.chip, { borderColor: category === cat ? "#a855f7" : c.border, backgroundColor: category === cat ? "#a855f720" : "transparent", marginRight: 8 }]}
              >
                <Text style={{ color: category === cat ? "#a855f7" : c.mutedForeground, fontSize: 13 }}>
                  {CATEGORY_EMOJI[cat]} {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={[styles.fieldLabel, { color: c.foreground }]}>Priority</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p} onPress={() => setPriority(p)}
                style={[styles.chip, { borderColor: priority === p ? PRIORITY_COLOR[p] : c.border, backgroundColor: priority === p ? `${PRIORITY_COLOR[p]}20` : "transparent" }]}
              >
                <Text style={{ color: priority === p ? PRIORITY_COLOR[p] : c.mutedForeground, fontSize: 13 }}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.fieldLabel, { color: c.foreground }]}>Deadline (optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]}
            value={deadline} onChangeText={setDeadline}
            placeholder="e.g. 2025-12-31"
            placeholderTextColor={c.mutedForeground}
          />
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

// ── Profile Editor ────────────────────────────────────────────────────────────

function ProfileEditor({ profile, onSave, onClose }: {
  profile: ContextProfile;
  onSave: (p: ContextProfile) => Promise<void>;
  onClose: () => void;
}) {
  const c = useColors();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<ContextProfile>(profile);
  const [saving, setSaving] = useState(false);

  const field = (key: keyof ContextProfile, label: string, placeholder: string, multiline = false) => (
    <View key={key}>
      <Text style={[styles.fieldLabel, { color: c.foreground }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.foreground, height: multiline ? 80 : undefined }]}
        value={form[key]} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
        placeholder={placeholder} placeholderTextColor={c.mutedForeground}
        multiline={multiline} textAlignVertical={multiline ? "top" : "auto"}
      />
    </View>
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient
        colors={isDark ? ["#0B0718", "#07050F"] as const : ["#F5F0FF", "#EDE8FA"] as const}
        style={{ flex: 1 }}
      >
        <View style={[styles.detailHeader, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Feather name="x" size={20} color={c.foreground} />
          </TouchableOpacity>
          <Text style={[styles.detailTitle, { color: c.foreground }]}>Context Profile</Text>
          <TouchableOpacity
            style={[styles.createBtn, saving && { opacity: 0.5 }]}
            onPress={async () => { setSaving(true); await onSave(form); setSaving(false); onClose(); }}
            disabled={saving}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.createBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          <Text style={[{ color: "#a855f7", fontSize: 13, marginBottom: 16, lineHeight: 20 }]}>
            Emma uses your profile to understand your priorities and make better predictions about what you need next.
          </Text>
          {field("name", "Your name", "Emma will use this to personalise suggestions")}
          {field("role", "Your role", "Designer, founder, student, …")}
          {field("currentProjects", "Current projects", "What are you working on?", true)}
          {field("upcomingDeadlines", "Upcoming deadlines", "Any important dates or deadlines?", true)}
          {field("goals", "Goals", "Short or long-term goals", true)}
          {field("notes", "Notes for Emma", "Anything else Emma should know about you", true)}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function PathfinderScreen() {
  const c = useColors();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const insets = useSafeAreaInsets();
  const {
    missions, createMission, updateMissionStep, completeMission, deleteMission,
    profile, saveProfile, suggestions, dismissSuggestion,
    observations, addObservation, dismissObservation, clearObservations,
    loading,
  } = usePathfinder();

  const [showNew, setShowNew] = useState(false);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<"observer" | "missions">("observer");

  const active = missions.filter((m) => m.status === "active");
  const completed = missions.filter((m) => m.status === "completed");

  const handleDelete = (id: number) => {
    Alert.alert("Delete Mission", "This will permanently remove this mission.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { void deleteMission(id); } },
    ]);
  };

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
          <Feather name="x" size={22} color={c.foreground} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.headerIcon}>🧭</Text>
            <Text style={[styles.headerTitle, { color: c.foreground }]}>Pathfinder</Text>
          </View>
          <Text style={[styles.headerSub, { color: c.mutedForeground }]}>Emma's intelligence layer</Text>
        </View>
        <TouchableOpacity onPress={() => setShowProfile(true)} style={styles.iconBtn}>
          <Feather name="user" size={20} color={c.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Watching status bar */}
      <View style={[styles.watchingBar, { backgroundColor: "#a855f710", borderColor: "#a855f730" }]}>
        <PulseRing />
        <Text style={{ color: "#a855f7", fontSize: 13, fontWeight: "600" }}>
          Emma is watching
        </Text>
        <Text style={[styles.watchingDetail, { color: c.mutedForeground }]}>
          {observations.length > 0
            ? `${observations.length} event${observations.length !== 1 ? "s" : ""} detected`
            : "No events yet"}
        </Text>
        {observations.length > 0 && (
          <TouchableOpacity onPress={clearObservations} style={{ marginLeft: "auto" }}>
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: c.border }]}>
        {(["observer", "missions"] as const).map((tab) => (
          <TouchableOpacity key={tab} style={styles.tab} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, { color: activeTab === tab ? "#a855f7" : c.mutedForeground }]}>
              {tab === "observer"
                ? `Observer${observations.length > 0 ? ` (${observations.length})` : ""}`
                : `Missions (${active.length})`}
            </Text>
            {activeTab === tab && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Observer tab */}
      {activeTab === "observer" ? (
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            {observations.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>👁️</Text>
                <Text style={[styles.emptyTitle, { color: c.foreground }]}>Emma is watching</Text>
                <Text style={[styles.emptySubtitle, { color: c.mutedForeground }]}>
                  As you chat with Emma, she will automatically surface detected events, upcoming deadlines, and proactive actions here.{"\n\n"}You can also paste any text below and Emma will analyze it instantly.
                </Text>
              </View>
            ) : (
              observations.map((obs) => (
                <ObservationCard
                  key={obs.id}
                  obs={obs}
                  onDismiss={() => dismissObservation(obs.id)}
                  c={c}
                />
              ))
            )}

            {/* Proactive suggestions surfaced here too */}
            {suggestions.length > 0 && (
              <View style={{ marginTop: observations.length > 0 ? 8 : 0 }}>
                <Text style={[styles.sectionLabel, { color: c.mutedForeground, marginBottom: 10 }]}>
                  ⚡ Suggested actions
                </Text>
                {suggestions.map((s) => (
                  <View key={s.id} style={[styles.suggestionCard, { backgroundColor: c.card, borderColor: c.border }]}>
                    <View style={[styles.suggestionIcon, { backgroundColor: `${s.type === "risk" ? "#ef4444" : "#a855f7"}20` }]}>
                      <Feather
                        name={s.type === "risk" ? "alert-triangle" : "zap"}
                        size={16}
                        color={s.type === "risk" ? "#ef4444" : "#a855f7"}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.suggestionTitle, { color: c.foreground }]}>{s.title}</Text>
                      <Text style={[styles.suggestionDesc, { color: c.mutedForeground }]}>{s.description}</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                        <TouchableOpacity
                          style={[styles.suggestionBtn, { backgroundColor: "#a855f7" }]}
                          onPress={() => { setShowNew(true); dismissSuggestion(s.id); }}
                        >
                          <Text style={styles.suggestionBtnText}>{s.actionLabel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.suggestionBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: c.border }]}
                          onPress={() => dismissSuggestion(s.id)}
                        >
                          <Text style={[styles.suggestionBtnText, { color: c.mutedForeground }]}>Dismiss</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Feed input */}
          <ContextFeedInput onAdd={addObservation} c={c} isDark={isDark} />
        </View>
      ) : (
        /* Missions tab */
        <FlatList
          data={[...active, ...completed]}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
          ListHeaderComponent={
            active.length === 0 && !loading ? (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>🧭</Text>
                <Text style={[styles.emptyTitle, { color: c.foreground }]}>No Active Missions</Text>
                <Text style={[styles.emptySubtitle, { color: c.mutedForeground }]}>
                  Create a mission and Emma will plan it step-by-step, track progress, and keep you on course.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={loading ? <ActivityIndicator color="#a855f7" style={{ marginTop: 20 }} /> : null}
          renderItem={({ item }) => (
            <MissionCard
              mission={item}
              onPress={() => setSelectedMission(item)}
              onComplete={() => { void completeMission(item.id); }}
              onDelete={() => handleDelete(item.id)}
            />
          )}
        />
      )}

      {/* FAB row */}
      <View style={[styles.fabRow, { bottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.fabSecondary, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={() => router.push("/conference")}
        >
          <Feather name="mic" size={18} color="#a855f7" />
          <Text style={[styles.fabSecondaryText, { color: "#a855f7" }]}>Conference</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => setShowNew(true)}>
          <Feather name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Modals */}
      {showNew && (
        <NewMissionModal
          onClose={() => setShowNew(false)}
          onCreate={async (title, desc, cat, prio, deadline) => {
            await createMission(title, desc, cat, prio, deadline);
          }}
        />
      )}
      {selectedMission && (
        <MissionDetail
          mission={missions.find((m) => m.id === selectedMission.id) ?? selectedMission}
          onClose={() => setSelectedMission(null)}
          onStepToggle={(stepId, completed) => { void updateMissionStep(selectedMission.id, stepId, completed); }}
        />
      )}
      {showProfile && (
        <ProfileEditor profile={profile} onSave={saveProfile} onClose={() => setShowProfile(false)} />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  headerIcon: { fontSize: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerSub: { fontSize: 11, marginTop: 1 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  watchingBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1,
  },
  watchingDetail: { fontSize: 12, marginLeft: 2 },

  tabs: { flexDirection: "row", borderBottomWidth: 1, marginHorizontal: 16 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, position: "relative" },
  tabText: { fontSize: 14, fontWeight: "600" },
  tabIndicator: { position: "absolute", bottom: 0, left: "25%", right: "25%", height: 2, backgroundColor: "#a855f7", borderRadius: 1 },

  // Observation card
  obsCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  obsCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  obsSourceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  obsTime: { fontSize: 11, flex: 1 },
  obsContext: { fontSize: 15, fontWeight: "700" },
  obsSummary: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  obsSection: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  obsSectionLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  obsBullet: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  obsPrepared: { marginBottom: 8 },
  obsActionRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  obsActionDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7, flexShrink: 0 },
  obsActionText: { fontSize: 13, flex: 1, lineHeight: 19 },
  obsApps: { marginTop: 8 },
  obsAppsLabel: { fontSize: 11, fontWeight: "600", marginBottom: 8 },

  // Context feed input
  feedInput: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  feedInputText: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  feedInputBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#a855f7", alignItems: "center", justifyContent: "center" },

  // Mission list
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardLeft: { flexDirection: "row", alignItems: "flex-start", flex: 1, gap: 10 },
  cardActions: { flexDirection: "row", gap: 2 },
  categoryEmoji: { fontSize: 22, marginTop: 2 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardMeta: { fontSize: 12 },
  priorityDot: { width: 7, height: 7, borderRadius: 4, marginTop: 3 },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressBar: { height: 4, borderRadius: 2 },
  progressLabel: { fontSize: 11 },

  // Suggestion cards (inside Observer)
  sectionLabel: { fontSize: 13, fontWeight: "700" },
  suggestionCard: { flexDirection: "row", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12, alignItems: "flex-start" },
  suggestionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  suggestionTitle: { fontSize: 14, fontWeight: "700" },
  suggestionDesc: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  suggestionBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  suggestionBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  // Modals
  detailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  detailTitle: { fontSize: 17, fontWeight: "700", flex: 1, textAlign: "center" },
  detailDesc: { fontSize: 14, lineHeight: 21, marginBottom: 20 },
  sectionLabelModal: { fontSize: 14, fontWeight: "700", marginBottom: 10, marginTop: 4 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  stepCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 14, flex: 1 },
  emptyText: { fontSize: 13, fontStyle: "italic" },
  emptyState: { alignItems: "center", padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8 },
  createBtn: { backgroundColor: "#a855f7", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  createBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  fabRow: { position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  fab: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#a855f7", alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#a855f7", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
  fabSecondary: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10, elevation: 2 },
  fabSecondaryText: { fontSize: 14, fontWeight: "600" },
});
