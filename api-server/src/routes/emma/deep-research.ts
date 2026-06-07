import { Router } from "express";
import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const router = Router();

// ── LangChain LLM — OpenRouter backend ───────────────────────────────────────
function makeLLM(model: string, streaming = false) {
  return new ChatOpenAI({
    model,
    streaming,
    openAIApiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ?? "placeholder",
    configuration: {
      baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    },
    maxTokens: 6000,
  });
}

// ── LangChain DuckDuckGoSearch — time:"w" enforces past-7-days results ────────
const ddg = new DuckDuckGoSearch({
  maxResults: 8,
  searchOptions: {
    time: "w",      // only results from the past week
    safeSearch: 0,  // include all results
  },
});

// ── Hub-page / source-homepage guard ─────────────────────────────────────────
// Drops items that are topic aggregators or outlet homepages rather than articles.

const HUB_TITLE_RX = [
  /breaking news headlines today/i,
  /hamburg heute/i,
  /alle artikel/i,
  /alle nachrichten/i,
  /latest news\s*$/i,
  /news heute\s*$/i,
  /^nachrichten (aus|von|über|in) /i,
  /^hamburg news\s*-?\s*$/i,
  /breaking news\s*$/i,
  /aktuelles\s*-?\s*$/i,
  /\d{1,2}[,.]?\d{3}\+?\s+stories/i,
];

function isHubPage(snippet: string): boolean {
  return HUB_TITLE_RX.some(rx => rx.test(snippet)) || snippet.trim().length < 20;
}

// ── Build query variants to maximise coverage ─────────────────────────────────

function buildQueries(query: string, monthYear: string): string[] {
  return [
    `${query} news ${monthYear}`,
    `${query} latest developments this week`,
    `${query} breaking news June 2026`,
  ];
}

// ── Run all DuckDuckGo queries in parallel, filter, deduplicate ───────────────

interface SearchResult {
  snippet: string;
  title: string;
  link: string;
}

async function searchAllQueries(queries: string[]): Promise<SearchResult[]> {
  const results = await Promise.allSettled(
    queries.map(q => ddg.invoke(q))
  );

  const allSnippets: SearchResult[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const raw = r.value;

    // DuckDuckGoSearch returns a JSON string of results
    let parsed: Array<{ snippet?: string; title?: string; link?: string }> = [];
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      continue;
    }

    for (const item of parsed) {
      const snippet = (item.snippet ?? "").trim();
      const title = (item.title ?? "").trim();
      const link = (item.link ?? "").trim();
      const key = title.toLowerCase().slice(0, 60);

      if (!snippet || isHubPage(snippet) || seen.has(key)) continue;
      seen.add(key);
      allSnippets.push({ snippet, title, link });
    }
  }

  return allSnippets;
}

// ── Strip Sonar / LLM deflection phrases ─────────────────────────────────────

function stripDeflection(text: string): string {
  return text
    .replace(/for (more|further|additional) (updates?|information|news|details?)[^.!?\n]*[.!?]/gi, "")
    .replace(/you can (check out|visit|find|see|browse|follow|access)[^.!?\n]*[.!?]/gi, "")
    .replace(/various (news )?sources (such as|including|like)[^.!?\n]*[.!?]/gi, "")
    .replace(/these (websites?|sources?|outlets?|publications?)[^.!?\n]*[.!?]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Deep Research SSE route ───────────────────────────────────────────────────

router.post("/deep-research", async (req, res) => {
  const { query } = req.body as { query: string };

  if (!query?.trim()) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* disconnected */ }
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const monthYear = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  try {
    // ── Step 1: LangChain DuckDuckGo search with week-recency filter ──────────
    send({ type: "progress", step: "searching", message: `Searching this week's news for "${query}"…` });

    const queries = buildQueries(query.trim(), monthYear);
    const searchResults = await searchAllQueries(queries);

    send({
      type: "progress",
      step: "reading",
      message: searchResults.length > 0
        ? `Found ${searchResults.length} fresh results from the past 7 days`
        : "Broadening search scope…",
    });

    // ── Step 2: Also query Google News RSS for verified headlines ─────────────
    send({ type: "progress", step: "analyzing", message: "Cross-checking Google News…" });

    let rssHeadlines: string[] = [];
    try {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:7d")}&hl=en-US&gl=US&ceid=US:en`;
      const rssResp = await fetch(rssUrl, {
        headers: { "User-Agent": "EmmaResearch/1.0" },
        signal: AbortSignal.timeout(6000),
      });
      if (rssResp.ok) {
        const xml = await rssResp.text();
        rssHeadlines = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
          .slice(0, 10)
          .map(m => {
            const block = m[1] ?? "";
            const title = (
              block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ??
              block.match(/<title>(.*?)<\/title>/)?.[1] ?? ""
            ).trim();
            const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "").trim();
            const source = (block.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? "").trim();
            return title && pubDate && !isHubPage(title)
              ? `"${title}" — ${source}, ${pubDate}`
              : "";
          })
          .filter(Boolean);
      }
    } catch { /* RSS failure is non-fatal */ }

    // ── Step 3: Synthesize with LangChain LLM ────────────────────────────────
    send({ type: "progress", step: "synthesizing", message: "Writing intelligence report…" });

    const totalResults = searchResults.length + rssHeadlines.length;

    const systemPrompt = [
      "You are Emma, an intelligence analyst at Emperial Intelligence.",
      `Report date: ${dateStr}.`,
      "",
      "ABSOLUTE RULES:",
      "1. Write in English only. Translate ALL non-English content before reporting.",
      "2. Every sentence must reference a SPECIFIC article or result: name the source, approximate date, and what it said.",
      "3. Do NOT mention general news websites or tell the user to visit any outlet.",
      "4. Do NOT produce general topic overviews. Report only what the search results actually say.",
      "5. Plain prose only — no bullet lists, no ** bold, no ## headers.",
      totalResults >= 3
        ? "6. Write 4-6 detailed paragraphs covering the who, what, when, where, why, and consequences."
        : "6. Fewer than 3 verified fresh results exist. State this clearly, then summarize what was found. Do NOT pad with old stories.",
      "7. End with a 'Sources:' section listing only the outlets whose specific content you cited.",
    ].join("\n");

    const ddgSection = searchResults.length > 0
      ? [
          `=== DUCKDUCKGO NEWS SEARCH RESULTS (past 7 days) ===`,
          searchResults.map((r, i) => [
            `[${i + 1}] ${r.title}`,
            `    URL: ${r.link}`,
            `    Snippet: ${r.snippet}`,
          ].join("\n")).join("\n\n"),
        ].join("\n")
      : "";

    const rssSection = rssHeadlines.length > 0
      ? [`=== GOOGLE NEWS HEADLINES (past 7 days) ===`, ...rssHeadlines].join("\n")
      : "";

    const researchData = [ddgSection, rssSection].filter(Boolean).join("\n\n---\n\n").slice(0, 16000);

    const userPrompt = totalResults > 0
      ? [
          `Query: "${query.trim()}"`,
          `Today: ${dateStr}`,
          "",
          researchData,
          "",
          "Write the intelligence report. Ground every claim in the search results above. Do not list news websites.",
        ].join("\n")
      : `Query: "${query.trim()}"\nToday: ${dateStr}\n\nNo verified fresh results found for this week. State this clearly. Do NOT list news websites. Share only confirmed background facts if any, making clear they are not this week's news.`;

    // Stream synthesis with LangChain streaming
    const llm = makeLLM("meta-llama/llama-4-maverick", true);
    const stream = await llm.stream([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    for await (const chunk of stream) {
      const content = typeof chunk.content === "string" ? chunk.content : "";
      if (content) send({ type: "content", content: stripDeflection(content) });
    }

    send({
      type: "done",
      sources: searchResults.slice(0, 15).map(r => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet.slice(0, 120),
        trust: 75,
      })),
    });

  } catch (err) {
    req.log.error({ err }, "deep-research failed");
    send({ type: "error", message: "Research failed. Please try again." });
    send({ type: "done", sources: [] });
  }

  res.end();
});

export default router;
