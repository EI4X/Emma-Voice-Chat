import { parse } from "node-html-parser";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface FetchedPage {
  url: string;
  content: string;
}

// ── Layer 3: Source Trust Scoring ─────────────────────────────────────────────
export function getTrustScore(url: string): number {
  try {
    const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (/\.gov(\/|$)/.test(url) || /\.gov$/.test(domain)) return 100;
    if (/\.edu(\/|$)/.test(url) || /\.edu$/.test(domain)) return 95;
    const tier1 = [
      "reuters.com","apnews.com","bbc.com","bbc.co.uk","nature.com",
      "science.org","ncbi.nlm.nih.gov","nih.gov","who.int","un.org",
      "arxiv.org","pubmed.ncbi.nlm.nih.gov","sciencedirect.com","jstor.org",
    ];
    if (tier1.some(d => domain === d || domain.endsWith("." + d))) return 90;
    const tier2 = [
      "nytimes.com","washingtonpost.com","theguardian.com","economist.com",
      "ft.com","wsj.com","bloomberg.com","wikipedia.org","britannica.com",
      "cnn.com","nbcnews.com","npr.org","politico.com","axios.com",
    ];
    if (tier2.some(d => domain === d || domain.endsWith("." + d))) return 80;
    const tier3 = [
      "techcrunch.com","wired.com","arstechnica.com","theverge.com",
      "forbes.com","businessinsider.com","time.com","newsweek.com",
      "scientificamerican.com","technologyreview.com","statista.com",
    ];
    if (tier3.some(d => domain === d || domain.endsWith("." + d))) return 70;
    const tier4 = [
      "github.com","stackoverflow.com","reddit.com","medium.com",
      "substack.com","quora.com","linkedin.com",
    ];
    if (tier4.some(d => domain === d || domain.endsWith("." + d))) return 50;
    if (/blog|press|news/.test(domain)) return 40;
    return 30;
  } catch { return 20; }
}

// ── Layer 1: DuckDuckGo search ────────────────────────────────────────────────
export async function webSearch(query: string, maxResults = 5): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EmmaAI/1.0; +https://emma.ai)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return [];

  const html = await res.text();
  const root = parse(html);
  const results: SearchResult[] = [];

  const links = root.querySelectorAll(".result");
  for (const el of links.slice(0, maxResults)) {
    const titleEl = el.querySelector(".result__title a");
    const snippetEl = el.querySelector(".result__snippet");
    const linkEl = el.querySelector(".result__url");

    const title = titleEl?.text.trim() ?? "";
    const snippet = snippetEl?.text.trim() ?? "";
    const rawHref = titleEl?.getAttribute("href") ?? "";

    let finalUrl = "";
    try {
      const parsed = new URL(rawHref, "https://duckduckgo.com");
      const uddg = parsed.searchParams.get("uddg");
      finalUrl = uddg ? decodeURIComponent(uddg) : (linkEl?.text.trim() ?? rawHref);
    } catch {
      finalUrl = linkEl?.text.trim() ?? rawHref;
    }

    if (title && finalUrl) {
      results.push({ title, url: finalUrl, snippet });
    }
  }

  return results;
}

// ── Layer 1: Bing scraping (second source for de-duplication) ─────────────────
async function bingSearch(query: string, maxResults = 6): Promise<SearchResult[]> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const root = parse(html);
    const results: SearchResult[] = [];
    for (const el of root.querySelectorAll(".b_algo").slice(0, maxResults)) {
      const a = el.querySelector("h2 a");
      const snippet = el.querySelector(".b_caption p, .b_snippet");
      const title = a?.text.trim() ?? "";
      const href = a?.getAttribute("href") ?? "";
      const snip = snippet?.text.trim() ?? "";
      if (title && href.startsWith("http")) results.push({ title, url: href, snippet: snip });
    }
    return results;
  } catch { return []; }
}

// ── Layer 1: Multi-source search orchestrator ─────────────────────────────────
export async function multiSearch(query: string, maxResults = 10): Promise<SearchResult[]> {
  const [ddg, bing] = await Promise.allSettled([
    webSearch(query, maxResults),
    bingSearch(query, maxResults),
  ]);
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const r of [
    ...(ddg.status === "fulfilled" ? ddg.value : []),
    ...(bing.status === "fulfilled" ? bing.value : []),
  ]) {
    const key = r.url.replace(/\/+$/, "");
    if (!seen.has(key)) { seen.add(key); merged.push(r); }
  }
  return merged.slice(0, maxResults);
}

// ── Layer 2: Browser agent — read page ───────────────────────────────────────
export async function fetchPageContent(url: string, maxChars = 3000): Promise<FetchedPage | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EmmaAI/1.0; +https://emma.ai)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    const root = parse(html);

    root.querySelectorAll("script, style, nav, header, footer, aside, noscript, [class*='cookie'], [class*='banner'], [id*='cookie']").forEach((el) => el.remove());

    const content = (root.querySelector("main, article, .content, #content, #main, body") ?? root)
      .text
      .replace(/\s{3,}/g, "\n\n")
      .replace(/\n{4,}/g, "\n\n")
      .trim()
      .slice(0, maxChars);

    return { url, content };
  } catch {
    return null;
  }
}

// ── Layer 2: Follow outbound references from a fetched page ──────────────────
export async function followReferences(
  pageHtml: string,
  baseUrl: string,
  maxRefs = 2,
): Promise<FetchedPage[]> {
  try {
    const root = parse(pageHtml);
    const baseDomain = new URL(baseUrl).hostname;

    // Collect external links from <a> tags
    const links: string[] = [];
    for (const a of root.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") ?? "";
      try {
        const abs = new URL(href, baseUrl).href;
        const dom = new URL(abs).hostname;
        // Prefer links going to different domains (cross-references)
        if (dom !== baseDomain && abs.startsWith("http")) links.push(abs);
      } catch { /* skip */ }
    }

    // Deduplicate and take first maxRefs
    const unique = [...new Set(links)].slice(0, maxRefs);
    const settled = await Promise.allSettled(unique.map(u => fetchPageContent(u, 2000)));
    return settled
      .filter((s): s is PromiseFulfilledResult<FetchedPage | null> => s.status === "fulfilled")
      .map(s => s.value)
      .filter((p): p is FetchedPage => p !== null);
  } catch { return []; }
}

// ── Legacy helper (used by existing /api/emma/search endpoint) ────────────────
export async function searchAndFetch(
  query: string,
  maxResults = 4,
  fetchPages = 2,
): Promise<{ results: SearchResult[]; pages: FetchedPage[] }> {
  const results = await webSearch(query, maxResults);
  const pageFetches = results.slice(0, fetchPages).map((r) => fetchPageContent(r.url));
  const settled = await Promise.allSettled(pageFetches);
  const pages: FetchedPage[] = settled
    .filter((s): s is PromiseFulfilledResult<FetchedPage | null> => s.status === "fulfilled")
    .map((s) => s.value)
    .filter((p): p is FetchedPage => p !== null);
  return { results, pages };
}

// ── Layer 4: Deep Research Loop ───────────────────────────────────────────────
export interface DeepResearchProgress {
  step: "searching" | "reading" | "analyzing" | "synthesizing";
  message: string;
  iteration?: number;
  totalIterations?: number;
}

export interface ScoredSource extends SearchResult {
  trust: number;
}

export interface DeepResearchResult {
  query: string;
  context: string;
  sources: ScoredSource[];
}

export async function deepResearchLoop(
  query: string,
  onProgress: (p: DeepResearchProgress) => void,
  iterations = 3,
): Promise<DeepResearchResult> {
  const sourceMap = new Map<string, ScoredSource>();
  const contentParts: string[] = [];
  const queries: string[] = [query];

  for (let i = 0; i < iterations; i++) {
    const q = queries[i] ?? query;
    onProgress({ step: "searching", message: `Searching: "${q}"`, iteration: i + 1, totalIterations: iterations });

    const results = await multiSearch(q, 8);
    const scored: ScoredSource[] = results.map(r => ({ ...r, trust: getTrustScore(r.url) }));
    scored.forEach(r => { if (!sourceMap.has(r.url)) sourceMap.set(r.url, r); });

    // Sort by trust; fetch top 3
    const toFetch = [...scored].sort((a, b) => b.trust - a.trust).slice(0, 3);
    onProgress({ step: "reading", message: `Reading ${toFetch.length} sources…`, iteration: i + 1, totalIterations: iterations });

    const pages = await Promise.allSettled(toFetch.map(r => fetchPageContent(r.url, 2500)));
    for (const p of pages) {
      if (p.status === "fulfilled" && p.value) {
        const src = sourceMap.get(p.value.url);
        contentParts.push(`[Source: ${p.value.url} | Trust: ${src?.trust ?? 30}/100]\n${p.value.content}`);
      }
    }

    // Generate a follow-up query for the next iteration
    if (i < iterations - 1) {
      onProgress({ step: "analyzing", message: "Identifying knowledge gaps…", iteration: i + 1, totalIterations: iterations });

      // Extract meaningful terms from top snippets to sharpen the next query
      const terms = scored
        .slice(0, 4)
        .flatMap(r => r.snippet.split(/\s+/))
        .filter(w => w.length > 5 && /^[A-Za-z]/.test(w))
        .filter((w, idx, arr) => arr.indexOf(w) === idx)
        .slice(0, 3);

      const suffix = i === 0 ? "detailed analysis evidence" : terms.join(" ");
      queries.push(`${query} ${suffix}`.trim());
    }
  }

  onProgress({ step: "synthesizing", message: "Synthesizing all findings…" });

  const sources = Array.from(sourceMap.values()).sort((a, b) => b.trust - a.trust);
  return {
    query,
    context: contentParts.join("\n\n---\n\n"),
    sources,
  };
}
