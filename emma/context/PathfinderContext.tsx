import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export interface MissionStep {
  id: number;
  missionId: number;
  title: string;
  description: string;
  completed: boolean;
  order: number;
  appKey?: string;
}

export interface Mission {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: "high" | "medium" | "low";
  status: "active" | "completed" | "archived";
  deadline?: string;
  completedAt?: string;
  createdAt: string;
  steps: MissionStep[];
}

export interface ContextProfile {
  name: string;
  role: string;
  currentProjects: string;
  upcomingDeadlines: string;
  goals: string;
  notes: string;
}

export interface ProactiveSuggestion {
  id: string;
  type: "mission" | "risk" | "opportunity" | "action";
  title: string;
  description: string;
  actionLabel: string;
  tags?: string[];
}

export interface Observation {
  id: string;
  timestamp: Date;
  context: string;
  summary: string;
  detected: string[];
  risks: string[];
  opportunities: string[];
  actions: string[];
  apps: string[];
  source: "chat" | "manual" | "conference";
}

export interface ConferenceNote {
  id: string;
  timestamp: Date;
  text: string;
  actionItems: string[];
}

interface PathfinderContextValue {
  missions: Mission[];
  loadMissions: () => Promise<void>;
  createMission: (title: string, description: string, category: string, priority: string, deadline?: string) => Promise<Mission | null>;
  updateMissionStep: (missionId: number, stepId: number, completed: boolean) => Promise<void>;
  completeMission: (id: number) => Promise<void>;
  deleteMission: (id: number) => Promise<void>;
  profile: ContextProfile;
  saveProfile: (p: ContextProfile) => Promise<void>;
  suggestions: ProactiveSuggestion[];
  addSuggestion: (s: ProactiveSuggestion) => void;
  dismissSuggestion: (id: string) => void;
  analyzeForSuggestions: (aiResponse: string) => void;
  observations: Observation[];
  addObservation: (obs: Omit<Observation, "id" | "timestamp">) => void;
  dismissObservation: (id: string) => void;
  clearObservations: () => void;
  conferenceActive: boolean;
  conferenceNotes: ConferenceNote[];
  conferenceSummary: string;
  startConference: () => void;
  stopConference: () => void;
  addConferenceNote: (text: string) => void;
  setConferenceSummary: (s: string) => void;
  clearConference: () => void;
  loading: boolean;
}

const defaultProfile: ContextProfile = {
  name: "", role: "", currentProjects: "", upcomingDeadlines: "", goals: "", notes: "",
};

const getBase = () =>
  typeof process !== "undefined" && process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
    : "/api";

async function apiFetch(path: string, opts?: RequestInit): Promise<unknown> {
  const res = await fetch(`${getBase()}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

const DEADLINE_PATTERNS = [
  /deadline[:\s]+(.{5,40})/gi,
  /due\s+(in|on|by)\s+(.{3,30})/gi,
  /submit\s+by\s+(.{3,30})/gi,
  /(\d+)\s+days?\s+left/gi,
  /expires?\s+(in|on)\s+(.{3,20})/gi,
];

const MISSION_TRIGGERS = [
  "proposal", "presentation", "project", "report", "pitch", "application",
  "funding", "plan", "strategy", "research", "meeting", "conference",
  "launch", "campaign", "analysis", "draft", "document", "prepare",
];

function detectSuggestions(text: string): Array<{ type: "risk" | "opportunity"; title: string; description: string }> {
  const lower = text.toLowerCase();
  const results: Array<{ type: "risk" | "opportunity"; title: string; description: string }> = [];
  for (const pattern of DEADLINE_PATTERNS) {
    const m = lower.match(pattern);
    if (m) {
      results.push({ type: "risk", title: "Deadline Detected", description: `Emma spotted: "${m[0]}". Track it in Pathfinder.` });
      break;
    }
  }
  const trigger = MISSION_TRIGGERS.find((t) => lower.includes(t));
  if (trigger && results.length === 0) {
    results.push({ type: "opportunity", title: "Turn this into a Mission", description: `This mentions "${trigger}". Let Emma plan it step-by-step in Pathfinder.` });
  }
  return results;
}

function extractActionItems(text: string): string[] {
  const items: string[] = [];
  const patterns = [
    /\bwe (need|should|must|will|are going to) (.{5,60})/gi,
    /\baction[:\s]+(.{5,60})/gi,
    /\bfollow[- ]up[:\s]+(.{5,60})/gi,
    /\btask[:\s]+(.{5,60})/gi,
  ];
  for (const p of patterns) {
    for (const m of [...text.matchAll(p)]) {
      const item = (m[2] ?? m[1] ?? "").trim();
      if (item.length > 4) items.push(item);
    }
  }
  return items.slice(0, 3);
}

const PathfinderCtx = createContext<PathfinderContextValue | null>(null);

export function PathfinderProvider({ children }: { children: React.ReactNode }) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [profile, setProfile] = useState<ContextProfile>(defaultProfile);
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [conferenceActive, setConferenceActive] = useState(false);
  const [conferenceNotes, setConferenceNotes] = useState<ConferenceNote[]>([]);
  const [conferenceSummary, setConferenceSummaryState] = useState("");
  const [loading, setLoading] = useState(false);
  const noteCounter = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem("pathfinder_profile").then((raw) => {
      if (raw) { try { setProfile(JSON.parse(raw) as ContextProfile); } catch { /**/ } }
    });
    void loadMissions();
  }, []);

  const loadMissions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/pathfinder/missions") as { missions: Mission[] };
      setMissions(data.missions ?? []);
    } catch { /**/ } finally { setLoading(false); }
  }, []);

  const createMission = useCallback(async (
    title: string, description: string, category: string, priority: string, deadline?: string
  ): Promise<Mission | null> => {
    try {
      const data = await apiFetch("/pathfinder/missions", {
        method: "POST",
        body: JSON.stringify({ title, description, category, priority, deadline }),
      }) as { mission: Mission };
      setMissions((prev) => [data.mission, ...prev]);
      return data.mission;
    } catch { return null; }
  }, []);

  const updateMissionStep = useCallback(async (missionId: number, stepId: number, completed: boolean) => {
    setMissions((prev) => prev.map((m) =>
      m.id === missionId ? { ...m, steps: m.steps.map((s) => s.id === stepId ? { ...s, completed } : s) } : m
    ));
    try {
      await apiFetch(`/pathfinder/missions/${missionId}/steps/${stepId}`, {
        method: "PATCH", body: JSON.stringify({ completed }),
      });
    } catch { /**/ }
  }, []);

  const completeMission = useCallback(async (id: number) => {
    setMissions((prev) => prev.map((m) => m.id === id ? { ...m, status: "completed" as const } : m));
    try { await apiFetch(`/pathfinder/missions/${id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) }); } catch { /**/ }
  }, []);

  const deleteMission = useCallback(async (id: number) => {
    setMissions((prev) => prev.filter((m) => m.id !== id));
    try { await apiFetch(`/pathfinder/missions/${id}`, { method: "DELETE" }); } catch { /**/ }
  }, []);

  const saveProfile = useCallback(async (p: ContextProfile) => {
    setProfile(p);
    await AsyncStorage.setItem("pathfinder_profile", JSON.stringify(p));
    try { await apiFetch("/pathfinder/context", { method: "POST", body: JSON.stringify(p) }); } catch { /**/ }
  }, []);

  const addSuggestion = useCallback((s: ProactiveSuggestion) => {
    setSuggestions((prev) => prev.some((x) => x.id === s.id) ? prev : [s, ...prev].slice(0, 5));
  }, []);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const analyzeForSuggestions = useCallback((aiResponse: string) => {
    const detected = detectSuggestions(aiResponse);
    detected.forEach((d, i) => {
      addSuggestion({
        id: `auto_${Date.now()}_${i}`, type: d.type,
        title: d.title, description: d.description,
        actionLabel: d.type === "risk" ? "Track Risk" : "Create Mission",
        tags: d.type === "risk" ? ["meeting", "follow-up"] : ["task", "productivity"],
      });
    });
    if (detected.length > 0) {
      const d = detected[0]!;
      setObservations((prev) => [{
        id: `obs_${Date.now()}`,
        timestamp: new Date(),
        context: d.title,
        summary: d.description,
        detected: d.type === "risk" ? ["deadline", "risk"] : ["task", "opportunity"],
        risks: d.type === "risk" ? [d.description] : [],
        opportunities: d.type === "opportunity" ? [d.description] : [],
        actions: ["Review in Pathfinder", "Create mission"],
        apps: d.type === "risk" ? ["notion", "todoist", "googlecalendar"] : ["notion", "trello"],
        source: "chat" as const,
      }, ...prev].slice(0, 20));
    }
  }, [addSuggestion]);

  const addObservation = useCallback((obs: Omit<Observation, "id" | "timestamp">) => {
    setObservations((prev) => [{
      ...obs, id: `obs_${Date.now()}`, timestamp: new Date(),
    }, ...prev].slice(0, 20));
  }, []);

  const dismissObservation = useCallback((id: string) => {
    setObservations((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const clearObservations = useCallback(() => setObservations([]), []);

  const startConference = useCallback(() => {
    setConferenceActive(true); setConferenceNotes([]); setConferenceSummaryState(""); noteCounter.current = 0;
  }, []);
  const stopConference = useCallback(() => setConferenceActive(false), []);

  const addConferenceNote = useCallback((text: string) => {
    noteCounter.current += 1;
    setConferenceNotes((prev) => [...prev, {
      id: `note_${noteCounter.current}`, timestamp: new Date(), text, actionItems: extractActionItems(text),
    }]);
  }, []);

  const setConferenceSummary = useCallback((s: string) => setConferenceSummaryState(s), []);
  const clearConference = useCallback(() => {
    setConferenceNotes([]); setConferenceSummaryState(""); setConferenceActive(false);
  }, []);

  return (
    <PathfinderCtx.Provider value={{
      missions, loadMissions, createMission, updateMissionStep, completeMission, deleteMission,
      profile, saveProfile,
      suggestions, addSuggestion, dismissSuggestion, analyzeForSuggestions,
      observations, addObservation, dismissObservation, clearObservations,
      conferenceActive, conferenceNotes, conferenceSummary,
      startConference, stopConference, addConferenceNote, setConferenceSummary, clearConference,
      loading,
    }}>
      {children}
    </PathfinderCtx.Provider>
  );
}

export function usePathfinder() {
  const ctx = useContext(PathfinderCtx);
  if (!ctx) throw new Error("usePathfinder must be used inside PathfinderProvider");
  return ctx;
}
