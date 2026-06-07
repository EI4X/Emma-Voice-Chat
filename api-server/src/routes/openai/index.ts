import { openrouter } from "@workspace/integrations-openrouter-ai";
import { db } from "@workspace/db";
import { conversations, messages, projects } from "@workspace/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { Router } from "express";
import {
  parseDeepLinkIntent,
  parseDeepLinkFromAIResponse,
  getDeepLinkSystemInstruction,
  formatDeepLinkContext,
} from "../emma/deeplinks";
import { searchAndFetch } from "../emma/search";
import { extractIp, getLocaleFromIpSync } from "../emma/locale";

const router = Router();

// ─── Constants ───────────────────────────────────────────────────────────────

const DEEPSEEK_MODEL = "meta-llama/llama-4-maverick";
const VOICE_MODEL = "meta-llama/llama-3.1-8b-instruct";

function buildSystemPrompt(detectedLanguage?: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

  return [
    "You are Emma, an advanced AI assistant created by Emperial Intelligence.",
    "Emperial Intelligence is a technology company focused on building advanced artificial intelligence systems that combine reasoning, research, and automation into a single intelligent experience.",
    "You were designed to serve as an Executive AI Assistant — an intelligent partner capable of helping individuals, professionals, entrepreneurs, and organizations make better decisions, save time, and increase productivity.",
    "Your capabilities include: advanced conversational intelligence, real-time research and knowledge synthesis, content generation and creative assistance, workflow and task automation, cross-application coordination, productivity and decision support.",
    "If anyone asks who built you, who created you, or who made you, always say you were created by Emperial Intelligence. Never say OpenAI, DeepSeek, Anthropic, Meta, or any other company name. You are Emma, built by Emperial Intelligence.",

    `TODAY'S DATE AND TIME: ${dateStr} at ${timeStr}. This is the real current date. Never treat it as future or uncertain. Never say a date is 'in the future' — you are operating in real time.`,

    "FORMATTING — STRICT RULES (never break these):\n" +
    "- Write in plain prose only. Never use **, *, __, ##, ###, or any markdown syntax.\n" +
    "- Never use bullet points or numbered lists unless the user explicitly asks for a list.\n" +
    "- Never add sign-off questions like 'Would you like more info?' or 'Let me know if you need anything else.' End your answer when it is complete.\n" +
    "- Never fabricate hyperlinks or URLs.\n" +
    "- For mathematics, always use LaTeX notation. Wrap display equations (fractions, integrals, complex expressions) in $$...$$ on their own line. Wrap inline math in $...$. Use standard LaTeX: \\frac{a}{b} for fractions, x^{2} for powers, \\sqrt{x} for roots, \\sum, \\int, \\theta, \\pi etc. Never write math in plain prose like '(a+b)/c' — always use LaTeX notation.",

    "CONFIDENCE — STRICT RULES:\n" +
    "- Speak with confidence and authority. Never hedge with phrases like 'might', 'could be', 'possibly', 'I believe', 'it seems', or 'based on my training'.\n" +
    "- When live search results are provided, report them as facts — not speculation. Say 'Hamburg is hosting...' not 'Hamburg might be hosting...'.\n" +
    "- When no search data is available, answer from knowledge confidently and concisely. Do not apologise for limitations.",

    "SOURCES — STRICT RULES:\n" +
    "- Only cite a source if it came from the LIVE SEARCH RESULTS block provided in the user message.\n" +
    "- Never invent source names, publication dates, or URLs. If no search data was provided, answer from knowledge with no citations.\n" +
    "- When search data IS present, cite inline as [1], [2] etc. and list them at the end under 'Sources:'.",

    "LIVE SEARCH — STRICT RULES:\n" +
    "- When the user message contains a block starting with '=== LIVE SEARCH RESULTS', that data was fetched from the web seconds ago and is 100% current.\n" +
    "- Treat it as ground truth. Synthesise it into a confident, direct answer.\n" +
    "- NEVER say the date is in the future. NEVER speculate about what news 'might' say. Report what the results actually say.\n" +
    "- Never say your knowledge has a cutoff when search results are in the message.\n" +
    "- Do not add disclaimers like 'as of my training data' or 'I cannot verify' when search results are present.",

    detectedLanguage
      ? `LANGUAGE — STRICT RULES:\n- The user's detected language based on their location is ${detectedLanguage}. Default to ${detectedLanguage} for your first response and for any messages where the user's language is ambiguous.\n- If the user writes in a different language, switch to that language immediately and maintain it.\n- Never switch to English unless the user explicitly writes in English.\n- Maintain the user's language throughout, including citations, labels, and structured output.`
      : "LANGUAGE — STRICT RULES:\n- Always respond in the exact same language the user wrote or spoke in. If they write in French, reply in French. If they write in Arabic, reply in Arabic. Never switch to English unless the user explicitly asks.\n- Maintain the user's language throughout the entire conversation, including citations, labels, and any structured output.",

    "Adapt your response length to what the user needs — short and direct for simple questions, detailed and thorough for complex research.",
    getDeepLinkSystemInstruction(),
  ].join("\n\n");
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateToken(length = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// ── Open-source image generation via FLUX.1-schnell (Apache 2.0, ~$0.003/image) ──
async function generateImageFlux(prompt: string): Promise<string> {
  // openrouter client points to OpenRouter's API which supports /images/generations
  const imgResult = await openrouter.images.generate({
    model: "black-forest-labs/flux-schnell",
    prompt: prompt.slice(0, 1000),
    n: 1,
  } as Parameters<typeof openrouter.images.generate>[0]);

  const item = (imgResult as { data?: Array<{ b64_json?: string; url?: string }> }).data?.[0];
  if (!item) throw new Error("No image in FLUX response");

  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;

  if (item.url) {
    const imgRes = await fetch(item.url);
    const buf = await imgRes.arrayBuffer();
    return `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
  }

  throw new Error("FLUX response contained no image data");
}

function needsImageGen(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return (
    (/\b(generate|create|draw|make|paint|illustrate|design|render|sketch)\b/.test(lower) &&
     /\b(image|picture|photo|illustration|artwork|painting|portrait|wallpaper|logo|icon|banner|graphic|visual|art)\b/.test(lower))
    || /^(draw |paint |generate an? image|create an? image|make an? image|illustrate )/i.test(lower)
  );
}

function needsSearch(text: string): boolean {
  const lower = text.toLowerCase();
  // Never search for these (pure conversational / identity / creative)
  const noSearchPatterns = [
    /^(hi|hello|hey|thanks|thank you|ok|okay|sure|great|perfect|yes|no|yep|nope)\b/i,
    /\b(who are you|what are you|tell me about yourself|your name|are you emma|are you an ai|who made you|who built you|who created you)\b/i,
    /^(help|what can you do)\b/i,
  ];
  if (lower.length < 8 || noSearchPatterns.some((r) => r.test(lower))) return false;

  const patterns = [
    // Time-sensitive signals
    /\b(latest|current|recent|news|today|now|update|happening|live|breaking|this week|this month|this year|just|trending)\b/i,
    // Any recent year mentioned
    /\b(2024|2025|2026|2027)\b/,
    // Real-world data
    /\b(price|cost|stock|market|weather|score|result|standings|schedule|rate|inflation|gdp)\b/i,
    // Geopolitics & conflicts
    /\b(war|conflict|crisis|attack|invasion|coup|sanction|protest|riot|strike|ceasefire|peace deal|treaty|election|vote|referendum)\b/i,
    // People & orgs in the news
    /\b(trump|biden|zelensky|putin|xi jinping|modi|macron|netanyahu|erdogan|mbs|nato|un |imf|who |wto|g7|g20|eu |opec)\b/i,
    // Countries & regions commonly in news
    /\b(iran|russia|ukraine|china|israel|palestine|hamas|hezbollah|taiwan|north korea|south korea|india|pakistan|saudi|gaza|west bank|syria|iraq|afghanistan|venezuela|cuba|myanmar)\b/i,
    // Company / tech news
    /\b(openai|anthropic|google|microsoft|apple|meta|amazon|tesla|nvidia|spacex|tiktok|twitter|x\.com|uber|airbnb)\b/i,
    /\b(ipo|merger|acquisition|bankrupt|layoff|earnings|revenue|quarterly|funding|valuation)\b/i,
    // Disasters & emergencies
    /\b(earthquake|flood|hurricane|tornado|wildfire|tsunami|eruption|explosion|crash|disaster|outbreak|pandemic|epidemic)\b/i,
    // Research / lookup intent
    /\b(search|look up|find out|research|what happened|tell me about|any news|new developments)\b/i,
    // Sports results
    /\b(who won|final score|match result|championship|tournament|league table|playoffs)\b/i,
  ];
  return patterns.some((r) => r.test(lower));
}

// ─── Shared streaming helper ──────────────────────────────────────────────────
// Routing strategy (all free open-source):
//   voice        → deepseek/deepseek-chat-v3-0324:free  (fast, no thinking)
//   search query → meta-llama/llama-4-maverick:free     (+ DuckDuckGo injection, zero cost)
//   reasoning    → deepseek/deepseek-r1:free            (deep thinking)

const SEARCH_MODEL = "meta-llama/llama-4-scout";

async function streamChat(
  history: Array<{ role: string; content: string }>,
  imageBase64s: string[] | undefined,
  res: import("express").Response,
  onComplete: (text: string) => Promise<void>,
  log: import("pino").Logger,
  voice = false,
  detectedLanguage?: string
): Promise<void> {
  const userContent = history[history.length - 1]?.content ?? "";
  const hasImages = imageBase64s && imageBase64s.length > 0;
  let fullResponse = "";

  const deepLink = parseDeepLinkIntent(userContent);
  if (deepLink) {
    const dlText = formatDeepLinkContext(deepLink);
    const friendlyMsg = `Sure! Opening ${deepLink.displayName} for you.\n${dlText}`;
    fullResponse = friendlyMsg;
    res.write(`data: ${JSON.stringify({ content: friendlyMsg, deepLink })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, deepLink })}\n\n`);
    await onComplete(fullResponse);
    return;
  }

  // ── Image generation ───────────────────────────────────────────────────────
  if (!voice && needsImageGen(userContent)) {
    log.info({ prompt: userContent.slice(0, 80) }, "streamChat: generating image with FLUX.1-schnell");
    try {
      const dataUrl = await generateImageFlux(userContent);
      const caption = "Here's your generated image.";
      res.write(`data: ${JSON.stringify({ content: caption, imageData: dataUrl })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      await onComplete(caption);
    } catch (err) {
      log.error({ err }, "streamChat: FLUX image generation failed");
      const errMsg = "Sorry, I couldn't generate that image. Please try a different description.";
      res.write(`data: ${JSON.stringify({ content: errMsg })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      await onComplete(errMsg);
    }
    return;
  }

  // ── Model routing ──────────────────────────────────────────────────────────
  // voice+search → llama-4-scout (fast + live results)
  // voice        → llama-3.1-8b (fast, no thinking delay)
  // search       → llama-4-scout + DuckDuckGo injection (live results)
  // other        → llama-4-maverick (deep reasoning)
  const isSearchQuery = needsSearch(userContent);
  // When images are attached, always use a vision-capable model (8B voice model has no vision)
  const model = isSearchQuery ? SEARCH_MODEL : (voice && !hasImages) ? VOICE_MODEL : DEEPSEEK_MODEL;
  // Build prompt at call time so today's date is always current
  const systemPrompt = buildSystemPrompt(detectedLanguage);

  log.info({ model, isSearchQuery, voice, hasImages, detectedLanguage }, "streamChat: routing decision");

  type ImagePart = { type: "image_url"; image_url: { url: string; detail: "auto" } };
  type TextPart = { type: "text"; text: string };
  type MsgContent = string | Array<ImagePart | TextPart>;

  const chatMessages: Array<{ role: "user" | "assistant" | "system"; content: MsgContent }> = history.map((m, idx) => {
    const isLastUser = idx === history.length - 1 && m.role === "user";
    if (isLastUser && hasImages) {
      return {
        role: "user" as const,
        content: [
          ...imageBase64s!.map((b64): ImagePart => ({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "auto" },
          })),
          { type: "text" as const, text: m.content || "What's in this image?" } satisfies TextPart,
        ],
      };
    }
    return { role: m.role as "user" | "assistant" | "system", content: m.content };
  });

  // ── Live search injection (free DuckDuckGo) ────────────────────────────────
  if (isSearchQuery) {
    try {
      const { results } = await searchAndFetch(userContent, 5, 2);
      if (results.length > 0) {
        const searchBlock = results
          .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
          .join("\n\n");
        const lastMsg = chatMessages[chatMessages.length - 1];
        lastMsg.content = `${userContent}\n\n=== LIVE SEARCH RESULTS ===\n${searchBlock}\n=== END SEARCH RESULTS ===`;
      }
    } catch (err) {
      log.warn({ err }, "streamChat: search injection failed, answering from model knowledge");
    }
  }

  const stream = await openrouter.chat.completions.create({
    model,
    max_tokens: voice ? 1024 : 4096,
    messages: [{ role: "system" as const, content: systemPrompt }, ...chatMessages] as Parameters<typeof openrouter.chat.completions.create>[0]["messages"],
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullResponse += delta;
      res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
    }
  }

  const aiDeepLink = parseDeepLinkFromAIResponse(fullResponse);
  res.write(`data: ${JSON.stringify({ done: true, ...(aiDeepLink ? { deepLink: aiDeepLink } : {}) })}\n\n`);
  await onComplete(fullResponse);
}

// ─── Projects ────────────────────────────────────────────────────────────────

router.get("/projects", async (req, res) => {
  const list = await db.select().from(projects).orderBy(asc(projects.createdAt));
  res.json(list);
});

router.post("/projects", async (req, res) => {
  const { name = "New Project", emoji = "📁" } = req.body as { name?: string; emoji?: string };
  if (!name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [project] = await db.insert(projects).values({ name: name.trim(), emoji }).returning();
  res.status(201).json(project);
});

router.patch("/projects/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const { name, emoji } = req.body as { name?: string; emoji?: string };
  const updates: Partial<{ name: string; emoji: string }> = {};
  if (name?.trim()) updates.name = name.trim();
  if (emoji) updates.emoji = emoji;
  if (!Object.keys(updates).length) {
    res.status(400).json({ error: "nothing to update" });
    return;
  }
  const [updated] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Project not found" }); return; }
  res.json(updated);
});

router.delete("/projects/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  await db.delete(projects).where(eq(projects.id, id));
  res.status(204).send();
});

// ─── Conversations ────────────────────────────────────────────────────────────

router.get("/conversations", async (req, res) => {
  const list = await db.select().from(conversations).orderBy(desc(conversations.createdAt));
  res.json(list);
});

router.post("/conversations", async (req, res) => {
  const { title = "New Chat", projectId } = req.body as { title?: string; projectId?: number };
  const [conv] = await db.insert(conversations).values({ title, projectId: projectId ?? null }).returning();
  res.status(201).json(conv);
});

router.patch("/conversations/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const { title } = req.body as { title: string };
  if (!title?.trim()) { res.status(400).json({ error: "title is required" }); return; }
  const [updated] = await db.update(conversations).set({ title: title.trim() }).where(eq(conversations.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.json(updated);
});

router.patch("/conversations/:id/project", async (req, res) => {
  const id = Number(req.params["id"]);
  const { projectId } = req.body as { projectId: number | null };
  const [updated] = await db.update(conversations).set({ projectId: projectId ?? null }).where(eq(conversations.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.json(updated);
});

router.post("/conversations/:id/archive", async (req, res) => {
  const id = Number(req.params["id"]);
  const [updated] = await db
    .update(conversations)
    .set({ archivedAt: new Date() })
    .where(eq(conversations.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.json(updated);
});

router.post("/conversations/:id/unarchive", async (req, res) => {
  const id = Number(req.params["id"]);
  const [updated] = await db
    .update(conversations)
    .set({ archivedAt: null })
    .where(eq(conversations.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.json(updated);
});

router.get("/conversations/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
  res.json({ ...conv, messages: msgs });
});

router.delete("/conversations/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  await db.delete(messages).where(eq(messages.conversationId, id));
  const deleted = await db.delete(conversations).where(eq(conversations.id, id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.status(204).send();
});

// ─── Share ────────────────────────────────────────────────────────────────────

router.post("/conversations/:id/share", async (req, res) => {
  const id = Number(req.params["id"]);
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  let token = conv.shareToken;
  if (!token) {
    token = generateToken();
    await db.update(conversations).set({ shareToken: token }).where(eq(conversations.id, id));
  }

  // Replit exposes the live domain(s) in REPLIT_DOMAINS; always use HTTPS
  const replitDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
  const host = replitDomain ?? (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "localhost";
  const proto = replitDomain ? "https" : ((req.headers["x-forwarded-proto"] as string) ?? "https");
  const url = `${proto}://${host}/api/openai/share/${token}`;
  res.json({ url, token });
});

router.get("/share/:token", async (req, res) => {
  const { token } = req.params;
  const [conv] = await db.select().from(conversations).where(eq(conversations.shareToken, token));
  if (!conv) { res.status(404).send("<h1>Not found</h1>"); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(asc(messages.createdAt));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(conv.title)} — Emma AI</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0A0A0A;color:#FFFFFF;min-height:100vh}
    .wrap{max-width:720px;margin:0 auto;padding:32px 16px 64px}
    .logo{font-size:12px;color:#555;margin-bottom:6px;letter-spacing:.8px;text-transform:uppercase}
    .brand{font-size:11px;color:#444;margin-bottom:24px;letter-spacing:.4px}
    h1{font-size:22px;font-weight:700;margin-bottom:6px}
    .meta{font-size:12px;color:#555;margin-bottom:36px}
    .msg{margin-bottom:14px}
    .msg.user{display:flex;justify-content:flex-end}
    .msg.assistant{display:flex;gap:10px;align-items:flex-start}
    .avatar{width:28px;height:28px;border-radius:50%;background:#1A1A1A;border:1px solid #232323;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:2px}
    .bubble{padding:11px 16px;border-radius:16px;font-size:15px;line-height:23px;max-width:80%}
    .user .bubble{background:#1A1A1A;border-bottom-right-radius:4px}
    .assistant .bubble{background:#111111;border:1px solid #232323;border-bottom-left-radius:4px}
    .footer{margin-top:48px;text-align:center;font-size:12px;color:#444}
    .footer a{color:#666;text-decoration:none}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">Emma AI</div>
    <div class="brand">by Emperial Intelligence</div>
    <h1>${escapeHtml(conv.title)}</h1>
    <div class="meta">${msgs.length} message${msgs.length !== 1 ? "s" : ""} · Shared conversation</div>
    ${msgs.map((m) => `
    <div class="msg ${m.role}">
      ${m.role === "assistant" ? '<div class="avatar">E</div>' : ""}
      <div class="bubble">${escapeHtml(m.content).replace(/\n/g, "<br>")}</div>
    </div>`).join("")}
    <div class="footer">Shared via <a href="/">Emma AI</a> · Built by Emperial Intelligence</div>
  </div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ─── Messages ────────────────────────────────────────────────────────────────

router.get("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params["id"]);
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
  res.json(msgs);
});

router.post("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params["id"]);
  const { content, imageBase64, imageBase64s: imgArr, voice } = req.body as {
    content: string; model?: string;
    imageBase64?: string; imageBase64s?: string[];
    voice?: boolean;
  };
  // Support both single imageBase64 (legacy) and imageBase64s array
  const imageBase64s = imgArr ?? (imageBase64 ? [imageBase64] : undefined);

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  await db.insert(messages).values({ conversationId: id, role: "user", content });

  const history = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));

  const ip = extractIp(req);
  const locale = getLocaleFromIpSync(ip);
  const detectedLanguage = locale.code !== "en" ? locale.name : undefined;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    await streamChat(
      history.map((m) => ({ role: m.role, content: m.content })),
      imageBase64s,
      res,
      async (fullResponse) => {
        await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });
        res.end();
      },
      req.log,
      voice ?? false,
      detectedLanguage
    );
  } catch (err) {
    req.log.error({ err }, "chat failed");
    res.write(`data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`);
    res.end();
  }
});

// ─── Stateless streaming (incognito mode) ────────────────────────────────────

router.post("/chat/stream", async (req, res) => {
  const { messages: msgHistory, imageBase64, imageBase64s: imgArr2, voice } = req.body as {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    imageBase64?: string;
    imageBase64s?: string[];
    voice?: boolean;
  };
  const imageBase64s = imgArr2 ?? (imageBase64 ? [imageBase64] : undefined);

  if (!msgHistory?.length) {
    res.status(400).json({ error: "messages is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const ip = extractIp(req);
  const locale = getLocaleFromIpSync(ip);
  const detectedLanguage = locale.code !== "en" ? locale.name : undefined;

  try {
    await streamChat(msgHistory, imageBase64s, res, async () => { res.end(); }, req.log, voice ?? false, detectedLanguage);
  } catch (err) {
    req.log.error({ err }, "chat/stream failed");
    res.write(`data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`);
    res.end();
  }
});

export default router;
