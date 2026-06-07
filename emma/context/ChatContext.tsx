import { fetch } from "expo/fetch";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Message, SearchResultMeta, DeepLinkMeta } from "@/components/ChatMessage";

export interface ResearchProgressEvent {
  step: "searching" | "reading" | "analyzing" | "synthesizing";
  message: string;
  iteration?: number;
  totalIterations?: number;
}

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

export interface Conversation {
  id: number;
  title: string;
  projectId?: number | null;
  shareToken?: string | null;
  archivedAt?: string | null;
  createdAt: string;
}

export interface Project {
  id: number;
  name: string;
  emoji: string;
  createdAt: string;
}

interface ChatContextValue {
  conversations: Conversation[];
  currentConversationId: number | null;
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingText: string;
  incognito: boolean;
  setIncognito: (v: boolean) => void;

  createConversation: (title?: string, projectId?: number) => Promise<number>;
  selectConversation: (id: number) => Promise<void>;
  sendMessage: (
    text: string,
    imageBase64s?: string[],
    onSentence?: (sentence: string) => void,
    voice?: boolean
  ) => Promise<string | null>;
  deepResearch: (
    query: string,
    onProgress?: (event: ResearchProgressEvent) => void
  ) => Promise<string | null>;
  stopStreaming: () => void;
  deleteConversation: (id: number) => Promise<void>;
  renameConversation: (id: number, title: string) => Promise<void>;
  assignConversationToProject: (convId: number, projectId: number | null) => Promise<void>;
  archiveConversation: (id: number) => Promise<void>;
  unarchiveConversation: (id: number) => Promise<void>;
  shareConversation: (id: number) => Promise<string | null>;
  startNewChat: () => void;
  loadConversations: () => Promise<void>;

  projects: Project[];
  loadProjects: () => Promise<void>;
  createProject: (name: string, emoji?: string) => Promise<Project>;
  renameProject: (id: number, name: string) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// Detect sentence boundaries and call onSentence for each complete sentence
function processSentences(
  newDelta: string,
  bufferRef: React.MutableRefObject<string>,
  onSentence: (s: string) => void
) {
  bufferRef.current += newDelta;
  // Match: at least 20 chars ending with [.!?] followed by whitespace or end
  const re = /^(.{20,}?[.!?])(?:\s+|$)/;
  let match: RegExpMatchArray | null;
  while ((match = bufferRef.current.match(re)) !== null) {
    const sentence = match[1]!.trim();
    if (sentence) onSentence(sentence);
    bufferRef.current = bufferRef.current.slice(match[0].length);
  }
}

async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onText: (full: string) => void,
  onMeta: (sr?: SearchResultMeta[], dl?: DeepLinkMeta) => void,
  onSentence?: (sentence: string) => void,
  sentenceBufRef?: React.MutableRefObject<string>
): Promise<{ text: string; searchResults?: SearchResultMeta[]; deepLink?: DeepLinkMeta; imageData?: string }> {
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let pendingSR: SearchResultMeta[] | undefined;
  let pendingDL: DeepLinkMeta | undefined;
  let pendingImageData: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const json = JSON.parse(line.slice(6));
        if (json.searchResults) pendingSR = json.searchResults as SearchResultMeta[];
        if (json.deepLink) pendingDL = json.deepLink as DeepLinkMeta;
        if (json.imageData) pendingImageData = json.imageData as string;
        if (json.content) {
          fullText += json.content;
          onText(fullText);
          if (onSentence && sentenceBufRef) {
            processSentences(json.content, sentenceBufRef, onSentence);
          }
        }
        if (json.done) {
          if (json.deepLink) pendingDL = json.deepLink as DeepLinkMeta;
          // Flush remaining sentence buffer
          if (onSentence && sentenceBufRef && sentenceBufRef.current.trim()) {
            onSentence(sentenceBufRef.current.trim());
            sentenceBufRef.current = "";
          }
          onMeta(pendingSR, pendingDL);
        }
      } catch {
        // skip malformed
      }
    }
  }
  return { text: fullText, searchResults: pendingSR, deepLink: pendingDL, imageData: pendingImageData };
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [incognito, setIncognitoState] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/openai/conversations`);
      if (res.ok) setConversations(await res.json());
    } catch { /* offline */ }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/openai/projects`);
      if (res.ok) setProjects(await res.json());
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    loadConversations();
    loadProjects();
  }, [loadConversations, loadProjects]);

  const setIncognito = useCallback((value: boolean) => {
    setIncognitoState(value);
    setCurrentConversationId(null);
    setMessages([]);
    setStreamingText("");
    setIsStreaming(false);
  }, []);

  const createConversation = useCallback(async (title = "New Chat", projectId?: number): Promise<number> => {
    const res = await fetch(`${BASE}/openai/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, projectId: projectId ?? null }),
    });
    const conv: Conversation = await res.json();
    setConversations((prev) => [conv, ...prev]);
    setCurrentConversationId(conv.id);
    // Do NOT clear messages here — callers like sendMessage have already added
    // an optimistic user message (with imageUri) that must survive conversation creation.
    // Message clearing is handled by startNewChat() and selectConversation() instead.
    return conv.id;
  }, []);

  const selectConversation = useCallback(async (id: number) => {
    setIsLoading(true);
    setCurrentConversationId(id);
    try {
      const res = await fetch(`${BASE}/openai/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        const mapped: Message[] = (data.messages ?? []).map(
          (m: { id: number; role: string; content: string; createdAt: string }) => ({
            id: String(m.id),
            role: m.role as "user" | "assistant",
            content: m.content,
            createdAt: new Date(m.createdAt),
          })
        );
        setMessages(mapped);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const renameConversation = useCallback(async (id: number, title: string) => {
    const res = await fetch(`${BASE}/openai/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const updated: Conversation = await res.json();
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
  }, []);

  const assignConversationToProject = useCallback(async (convId: number, projectId: number | null) => {
    const res = await fetch(`${BASE}/openai/conversations/${convId}/project`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (res.ok) {
      const updated: Conversation = await res.json();
      setConversations((prev) => prev.map((c) => (c.id === convId ? updated : c)));
    }
  }, []);

  const archiveConversation = useCallback(async (id: number) => {
    const res = await fetch(`${BASE}/openai/conversations/${id}/archive`, { method: "POST" });
    if (res.ok) {
      const updated: Conversation = await res.json();
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
      if (currentConversationId === id) { setCurrentConversationId(null); setMessages([]); }
    }
  }, [currentConversationId]);

  const unarchiveConversation = useCallback(async (id: number) => {
    const res = await fetch(`${BASE}/openai/conversations/${id}/unarchive`, { method: "POST" });
    if (res.ok) {
      const updated: Conversation = await res.json();
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
  }, []);

  const shareConversation = useCallback(async (id: number): Promise<string | null> => {
    try {
      const res = await fetch(`${BASE}/openai/conversations/${id}/share`, { method: "POST" });
      if (res.ok) {
        const { url } = await res.json();
        return url as string;
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const stopStreaming = useCallback(() => { abortRef.current?.abort(); }, []);

  const deepResearch = useCallback(
    async (
      query: string,
      onProgress?: (event: ResearchProgressEvent) => void,
    ): Promise<string | null> => {
      const userMsg: Message = {
        id: `${Date.now()}-user`,
        role: "user",
        content: query,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingText("");
      abortRef.current = new AbortController();

      let fullText = "";
      let finalSources: SearchResultMeta[] | undefined;

      try {
        const res = await fetch(`${BASE}/emma/deep-research`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, iterations: 3 }),
          signal: abortRef.current.signal,
        });

        if (!res.body) throw new Error("No response body");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const json = JSON.parse(line.slice(6));
              if (json.type === "progress" && onProgress) {
                onProgress(json as ResearchProgressEvent);
              }
              if (json.type === "content" && json.content) {
                fullText += json.content;
                setStreamingText(fullText);
              }
              if (json.type === "done") {
                if (json.sources) {
                  finalSources = (json.sources as Array<{ title: string; url: string }>).map(
                    (s) => ({ title: s.title, url: s.url }),
                  );
                }
              }
            } catch { /* skip malformed */ }
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-assistant`,
            role: "assistant",
            content: fullText,
            createdAt: new Date(),
            searchResults: finalSources,
          },
        ]);
        setStreamingText("");
        return fullText || null;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          if (fullText) {
            setMessages((prev) => [
              ...prev,
              { id: `${Date.now()}-assistant`, role: "assistant", content: fullText, createdAt: new Date() },
            ]);
          }
          setStreamingText("");
          return null;
        }
        setMessages((prev) => [
          ...prev,
          { id: `${Date.now()}-error`, role: "assistant", content: "Research failed. Please try again.", createdAt: new Date() },
        ]);
        return null;
      } finally {
        setIsStreaming(false);
        setStreamingText("");
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (
      text: string,
      imageBase64s?: string[],
      onSentence?: (sentence: string) => void,
      voice?: boolean
    ): Promise<string | null> => {
      const firstImage = imageBase64s?.[0];
      const userMsg: Message = {
        id: `${Date.now()}-user`,
        role: "user",
        content: text,
        imageUri: firstImage ? `data:image/jpeg;base64,${firstImage}` : undefined,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingText("");
      abortRef.current = new AbortController();

      // Sentence buffer ref for streaming sentence detection
      const sentenceBufRef: React.MutableRefObject<string> = { current: "" };
      let finalSR: SearchResultMeta[] | undefined;
      let finalDL: DeepLinkMeta | undefined;
      let fullText = "";

      try {
        // ── Incognito path ───────────────────────────────────────────────────
        if (incognito) {
          const historyForApi = [...messagesRef.current, userMsg].map((m) => ({
            role: m.role, content: m.content,
          }));

          const res = await fetch(`${BASE}/openai/chat/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: historyForApi, imageBase64s, voice: voice ?? false }),
            signal: abortRef.current.signal,
          });

          if (!res.body) throw new Error("No response body");
          const { text: t, searchResults, deepLink, imageData } = await readSSEStream(
            res.body.getReader(),
            (full) => setStreamingText(full),
            (sr, dl) => { finalSR = sr; finalDL = dl; },
            onSentence,
            sentenceBufRef
          );
          fullText = t;

          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-assistant`, role: "assistant", content: fullText,
              createdAt: new Date(), searchResults: finalSR, deepLink: finalDL,
              imageUri: imageData,
            },
          ]);
          setStreamingText("");
          return fullText || null;
        }

        // ── Regular path ─────────────────────────────────────────────────────
        let convId = currentConversationId;
        if (!convId) {
          convId = await createConversation(text.slice(0, 50) || "New Chat");
        }

        const res = await fetch(`${BASE}/openai/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text, imageBase64s, voice: voice ?? false }),
          signal: abortRef.current.signal,
        });

        if (!res.body) throw new Error("No response body");
        const { text: t, searchResults, deepLink, imageData } = await readSSEStream(
          res.body.getReader(),
          (full) => setStreamingText(full),
          (sr, dl) => { finalSR = sr; finalDL = dl; },
          onSentence,
          sentenceBufRef
        );
        fullText = t;

        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-assistant`, role: "assistant", content: fullText,
            createdAt: new Date(), searchResults: finalSR, deepLink: finalDL,
            imageUri: imageData,
          },
        ]);
        setStreamingText("");
        return fullText || null;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          if (fullText) {
            setMessages((prev) => [
              ...prev,
              { id: `${Date.now()}-assistant`, role: "assistant", content: fullText, createdAt: new Date() },
            ]);
          }
          setStreamingText("");
          return null;
        }
        setMessages((prev) => [
          ...prev,
          { id: `${Date.now()}-error`, role: "assistant", content: "Sorry, something went wrong. Please try again.", createdAt: new Date() },
        ]);
        return null;
      } finally {
        setIsStreaming(false);
        setStreamingText("");
      }
    },
    [currentConversationId, createConversation, incognito]
  );

  const deleteConversation = useCallback(async (id: number) => {
    await fetch(`${BASE}/openai/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConversationId === id) { setCurrentConversationId(null); setMessages([]); }
  }, [currentConversationId]);

  const startNewChat = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
    setStreamingText("");
    setIsStreaming(false);
  }, []);

  const createProject = useCallback(async (name: string, emoji = "📁"): Promise<Project> => {
    const res = await fetch(`${BASE}/openai/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, emoji }),
    });
    const project: Project = await res.json();
    setProjects((prev) => [...prev, project]);
    return project;
  }, []);

  const renameProject = useCallback(async (id: number, name: string) => {
    const res = await fetch(`${BASE}/openai/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const updated: Project = await res.json();
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    }
  }, []);

  const deleteProject = useCallback(async (id: number) => {
    await fetch(`${BASE}/openai/projects/${id}`, { method: "DELETE" });
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setConversations((prev) => prev.map((c) => (c.projectId === id ? { ...c, projectId: null } : c)));
  }, []);

  return (
    <ChatContext.Provider
      value={{
        conversations, currentConversationId, messages,
        isLoading, isStreaming, streamingText,
        incognito, setIncognito,
        createConversation, selectConversation, sendMessage, deepResearch,
        stopStreaming, deleteConversation, renameConversation,
        assignConversationToProject, archiveConversation, unarchiveConversation,
        shareConversation, startNewChat, loadConversations,
        projects, loadProjects, createProject, renameProject, deleteProject,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used inside ChatProvider");
  return ctx;
}
