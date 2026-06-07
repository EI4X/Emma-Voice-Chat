import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Linking, Platform, Share } from "react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MathBlock } from "./MathBlock";
import { useColors } from "@/hooks/useColors";

export interface SearchResultMeta {
  title: string;
  url: string;
}

export interface DeepLinkMeta {
  app: string;
  scheme: string;
  fallback: string;
  webUrl: string;
  displayName: string;
  prefillText?: string;
  action?: "message" | "search" | "compose" | "navigate" | "open";
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  imageUri?: string;
  searchResults?: SearchResultMeta[];
  deepLink?: DeepLinkMeta;
}

interface Props {
  message: Message;
  isStreaming?: boolean;
  onShare?: (text: string) => void;
  onReadAloud?: (text: string) => Promise<void>;
  onStopReadAloud?: () => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function stripDeepLinkLine(text: string): string {
  return text.replace(/\nDEEPLINK:\{[\s\S]*?\}\s*$/m, "").trim();
}

// ── Math helpers ────────────────────────────────────────────────────────────

const LATEX_SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ",
  sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", chi: "χ",
  psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ",
  Lambda: "Λ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  infty: "∞", sum: "Σ", prod: "Π", int: "∫", partial: "∂",
  nabla: "∇", pm: "±", mp: "∓", times: "×", div: "÷", cdot: "·",
  leq: "≤", geq: "≥", neq: "≠", approx: "≈", equiv: "≡",
  propto: "∝", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆",
  cup: "∪", cap: "∩", emptyset: "∅", rightarrow: "→", leftarrow: "←",
  Rightarrow: "⇒", Leftarrow: "⇐", leftrightarrow: "↔", to: "→",
  ldots: "…", cdots: "⋯", forall: "∀", exists: "∃",
  neg: "¬", land: "∧", lor: "∨", sqrt: "√", degree: "°",
};

const SUP: Record<string, string> = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","n":"ⁿ" };
const SUB: Record<string, string> = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉" };

function convertInlineMath(latex: string): string {
  let s = latex;
  s = s.replace(/\\([a-zA-Z]+)/g, (_, cmd) => LATEX_SYMBOLS[cmd] ?? `\\${cmd}`);
  s = s.replace(/\^{([^}]*)}/g, (_, n) => n.split("").map((c: string) => SUP[c] ?? c).join(""));
  s = s.replace(/\^([a-zA-Z0-9+\-])/g, (_, c) => SUP[c] ?? c);
  s = s.replace(/_{([^}]*)}/g, (_, n) => n.split("").map((c: string) => SUB[c] ?? c).join(""));
  s = s.replace(/_{([a-zA-Z0-9])}/g, (_, c) => SUB[c] ?? c);
  s = s.replace(/\\frac{([^}]*)}{([^}]*)}/g, "($1)/($2)");
  s = s.replace(/[{}]/g, "");
  return s;
}

type Segment =
  | { kind: "text"; content: string }
  | { kind: "display"; latex: string }
  | { kind: "inline"; latex: string };

function parseSegments(raw: string): Segment[] {
  const result: Segment[] = [];
  const displayParts = raw.split(/(\$\$[\s\S]+?\$\$)/g);
  for (const dp of displayParts) {
    if (dp.startsWith("$$") && dp.endsWith("$$") && dp.length > 4) {
      result.push({ kind: "display", latex: dp.slice(2, -2).trim() });
    } else {
      const inlineParts = dp.split(/(\$(?!\d)(?:[^$\n])+?\$)/g);
      for (const ip of inlineParts) {
        if (ip.startsWith("$") && ip.endsWith("$") && ip.length > 2) {
          result.push({ kind: "inline", latex: ip.slice(1, -1) });
        } else if (ip) {
          result.push({ kind: "text", content: ip });
        }
      }
    }
  }
  return result;
}

function stripMd(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

// Renders a plain text string with clickable [n] citation badges
function renderPlainSegment(text: string, color: string, searchResults?: SearchResultMeta[]): React.ReactNode {
  const clean = stripMd(text);
  if (!searchResults?.length) {
    return <Text style={{ color, fontSize: 15, lineHeight: 23 }}>{clean}</Text>;
  }
  const parts = clean.split(/(\[\d+\])/g);
  return (
    <Text style={{ color, fontSize: 15, lineHeight: 23 }}>
      {parts.map((p, i) => {
        const m = p.match(/^\[(\d+)\]$/);
        if (m) {
          const sr = searchResults[parseInt(m[1], 10) - 1];
          if (sr) {
            return (
              <Text key={i} onPress={() => Linking.openURL(sr.url).catch(() => {})} style={styles.citationBadge}>
                {m[1]}
              </Text>
            );
          }
        }
        return <Text key={i}>{p}</Text>;
      })}
    </Text>
  );
}

// Main content renderer — handles display math, inline math, and plain text
function renderContent(
  raw: string,
  color: string,
  bgColor: string,
  searchResults?: SearchResultMeta[],
  isStreaming?: boolean
): React.ReactNode {
  // Don't parse math while streaming — avoids WebView thrashing on every token
  if (isStreaming) {
    return renderPlainSegment(raw, color, searchResults);
  }

  const segments = parseSegments(raw);
  const hasMath = segments.some((s) => s.kind !== "text");
  if (!hasMath) {
    return renderPlainSegment(raw, color, searchResults);
  }

  return (
    <View style={{ gap: 4 }}>
      {segments.map((seg, i) => {
        if (seg.kind === "display") {
          return <MathBlock key={i} latex={seg.latex} display textColor={color} bgColor={bgColor} />;
        }
        if (seg.kind === "inline") {
          // If the expression contains complex commands (nested braces, fractions,
          // radicals, etc.) the Unicode converter can't handle them — use KaTeX instead.
          const isComplex = /\\(frac|sqrt|sum|int|prod|lim|binom|left|right|begin|end|over|operatorname)\b/.test(seg.latex);
          if (isComplex) {
            return <MathBlock key={i} latex={seg.latex} display={false} textColor={color} bgColor={bgColor} />;
          }
          return (
            <Text key={i} style={[styles.inlineMath, { color }]}>
              {convertInlineMath(seg.latex)}
            </Text>
          );
        }
        return (
          <React.Fragment key={i}>
            {renderPlainSegment(seg.content, color, searchResults)}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function SourceChip({ result, index }: { result: SearchResultMeta; index: number }) {
  const c = useColors();
  const domain = (() => {
    try {
      return new URL(result.url).hostname.replace("www.", "");
    } catch {
      return result.url.slice(0, 20);
    }
  })();
  return (
    <TouchableOpacity
      style={[styles.sourceChip, { backgroundColor: c.secondary, borderColor: c.border }]}
      onPress={() => Linking.openURL(result.url)}
      activeOpacity={0.7}
    >
      <Text style={[styles.sourceIndex, { color: c.neonPurple }]}>{index + 1}</Text>
      <Feather name="globe" size={11} color={c.mutedForeground} />
      <Text style={[styles.sourceText, { color: c.mutedForeground }]} numberOfLines={1}>
        {domain}
      </Text>
    </TouchableOpacity>
  );
}

function DeepLinkButton({ dl }: { dl: DeepLinkMeta }) {
  const c = useColors();
  const [launched, setLaunched] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasPrefill = Boolean(dl.prefillText);

  const actionLabel = (() => {
    if (dl.action === "message" || dl.action === "compose") return `Open ${dl.displayName}`;
    if (dl.action === "search") return `Search on ${dl.displayName}`;
    return `Open ${dl.displayName}`;
  })();

  const handleCopyText = async () => {
    if (!dl.prefillText) return;
    await Clipboard.setStringAsync(dl.prefillText);
    Haptics.selectionAsync();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpen = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (dl.prefillText) await Clipboard.setStringAsync(dl.prefillText);
    try {
      if (Platform.OS === "web") {
        await Linking.openURL(dl.webUrl || dl.fallback);
      } else {
        const target = dl.scheme || dl.fallback;
        if (target && target !== "://") {
          const canOpen = await Linking.canOpenURL(target);
          await Linking.openURL(canOpen ? target : dl.webUrl || dl.fallback);
        } else {
          await Linking.openURL(dl.webUrl || dl.fallback);
        }
      }
      setLaunched(true);
    } catch {
      try {
        await Linking.openURL(dl.webUrl || dl.fallback);
        setLaunched(true);
      } catch {
        // ignore
      }
    }
  };

  return (
    <View style={[styles.deepLinkCard, { backgroundColor: c.secondary, borderColor: c.border }]}>
      <View style={styles.deepLinkHeader}>
        <View
          style={[styles.appIconDot, { backgroundColor: c.highlight, borderColor: c.border }]}
        >
          <Feather name="smartphone" size={13} color={c.mutedForeground} />
        </View>
        <Text style={[styles.appName, { color: c.mutedForeground }]}>
          {dl.action === "search" ? `Search · ${dl.displayName}` : dl.displayName}
        </Text>
      </View>
      {hasPrefill && (
        <View style={[styles.prefillBox, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.prefillText, { color: c.foreground }]} numberOfLines={4}>
            {dl.prefillText}
          </Text>
        </View>
      )}
      <View style={styles.deepLinkActions}>
        {hasPrefill && (
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: c.border }]}
            onPress={handleCopyText}
            activeOpacity={0.75}
          >
            <Feather
              name={copied ? "check" : "copy"}
              size={13}
              color={copied ? "#22c55e" : c.mutedForeground}
            />
            <Text
              style={[styles.secondaryBtnText, { color: copied ? "#22c55e" : c.mutedForeground }]}
            >
              {copied ? "Copied!" : "Copy text"}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            { backgroundColor: launched ? c.highlight : c.foreground, flex: 1 },
          ]}
          onPress={handleOpen}
          activeOpacity={0.8}
        >
          <Feather
            name={launched ? "check" : "arrow-up-right"}
            size={14}
            color={launched ? c.mutedForeground : c.background}
          />
          <Text
            style={[
              styles.primaryBtnText,
              { color: launched ? c.mutedForeground : c.background },
            ]}
          >
            {launched
              ? hasPrefill
                ? "Opened · Text copied"
                : `Opened ${dl.displayName}`
              : hasPrefill
              ? `${actionLabel} & paste`
              : actionLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ChatMessage({ message, isStreaming, onShare, onReadAloud, onStopReadAloud }: Props) {
  const c = useColors();
  const isUser = message.role === "user";
  const displayText = stripDeepLinkLine(message.content);
  const [reading, setReading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(displayText);
      } else {
        await Clipboard.setStringAsync(displayText);
      }
    } catch {
      await Clipboard.setStringAsync(displayText).catch(() => {});
    }
    Haptics.selectionAsync();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    Haptics.selectionAsync();
    if (onShare) {
      onShare(displayText);
      return;
    }
    try {
      if (Platform.OS === "web") {
        if (navigator.share) {
          await navigator.share({ text: displayText, title: "Emma AI" }).catch(() => {});
        } else {
          await navigator.clipboard?.writeText(displayText);
        }
      } else {
        await Share.share({ message: displayText, title: "Emma AI" });
      }
    } catch { /* user cancelled */ }
  };

  const handleReadAloud = async () => {
    if (!onReadAloud) return;
    if (reading) {
      // Already reading — stop it
      onStopReadAloud?.();
      setReading(false);
      return;
    }
    setReading(true);
    Haptics.selectionAsync();
    try {
      await onReadAloud(displayText);
    } finally {
      setReading(false);
    }
  };

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userContent}>
          {message.imageUri && (
            <Image
              source={{ uri: message.imageUri }}
              style={styles.userImage}
              contentFit="cover"
            />
          )}
          {displayText ? (
            <View style={[styles.userBubble, { backgroundColor: c.secondary }]}>
              <Text style={[styles.userText, { color: c.foreground }]}>{displayText}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <View style={[styles.assistantAvatar, { backgroundColor: c.secondary, borderColor: c.border }]}>
        <Text style={[styles.avatarLetter, { color: c.foreground }]}>E</Text>
      </View>
      <View style={styles.assistantContent}>
        {message.searchResults && message.searchResults.length > 0 && (
          <View style={styles.sourcesRow}>
            {message.searchResults.slice(0, 5).map((r, i) => (
              <SourceChip key={i} result={r} index={i} />
            ))}
          </View>
        )}

        <View style={[styles.assistantBubble, { backgroundColor: c.card, borderColor: c.border }]}>
          {message.imageUri && (
            <Image
              source={{ uri: message.imageUri }}
              style={styles.assistantImage}
              contentFit="cover"
            />
          )}
          {renderContent(displayText, c.foreground, c.card, message.searchResults, isStreaming)}
        </View>

        {message.deepLink && <DeepLinkButton dl={message.deepLink} />}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
            <Feather
              name={copied ? "check" : "copy"}
              size={15}
              color={copied ? "#22c55e" : c.mutedForeground}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <Feather name="share" size={15} color={c.mutedForeground} />
          </TouchableOpacity>
          {onReadAloud && (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                reading && { backgroundColor: "#7c3aed22", borderRadius: 8 },
              ]}
              onPress={handleReadAloud}
            >
              {reading ? (
                <Feather name="pause" size={15} color="#a78bfa" />
              ) : (
                <Feather name="volume-2" size={15} color={c.mutedForeground} />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionBtn}>
            <Feather name="thumbs-up" size={15} color={c.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Feather name="thumbs-down" size={15} color={c.mutedForeground} />
          </TouchableOpacity>
          <Text
            style={[styles.timestamp, { color: c.mutedForeground, marginLeft: "auto" as any }]}
          >
            {formatTime(message.createdAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  userContent: { alignItems: "flex-end", gap: 6, maxWidth: "80%" },
  userImage: { width: 200, height: 150, borderRadius: 14, borderBottomRightRadius: 4 },
  userBubble: {
    borderRadius: 18,
    borderBottomRightRadius: 5,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  userText: { fontSize: 15, lineHeight: 22 },

  assistantRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    alignItems: "flex-start",
  },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    borderWidth: 1,
  },
  avatarLetter: { fontSize: 12, fontWeight: "700" as const },
  assistantContent: { flex: 1, gap: 8 },
  assistantBubble: {
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  assistantImage: {
    width: "100%",
    height: 180,
    borderRadius: 10,
  },
  sourcesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sourceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  sourceIndex: { fontSize: 10, fontWeight: "700" as const },
  sourceText: { fontSize: 11, maxWidth: 90 },
  citationBadge: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#a78bfa",
    backgroundColor: "#7c3aed22",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },

  deepLinkCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  deepLinkHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  appIconDot: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  appName: { fontSize: 12, fontWeight: "600" as const, letterSpacing: 0.1 },
  prefillBox: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  prefillText: { fontSize: 13, lineHeight: 20 },
  deepLinkActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "500" as const },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  primaryBtnText: { fontSize: 13, fontWeight: "600" as const },

  actions: { flexDirection: "row", alignItems: "center", gap: 2, paddingTop: 2 },
  actionBtn: { padding: 7 },
  timestamp: { fontSize: 11 },
  inlineMath: { fontFamily: Platform.select({ ios: "Courier New", android: "monospace", default: "monospace" }), fontSize: 14, lineHeight: 21 },
});
