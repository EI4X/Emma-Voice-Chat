import { Router } from "express";
import PptxGenJS from "pptxgenjs";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

// ── Prompts ───────────────────────────────────────────────────────────────────

function buildPrompt(useImages: boolean, numSlides: number): string {
  const imgRule = useImages
    ? `- For every "content" slide include "imageQuery": a SHORT, UNIQUE 3-5 word photo search term specific to THAT slide's content (e.g. "coral reef underwater close-up", "silicon valley startup office", "ancient roman forum ruins"). Each slide MUST have a DIFFERENT imageQuery — never reuse the same phrase.`
    : `- Do not include any "imageQuery" fields.`;

  return `You are Emma, an expert presentation designer. Generate a complete professional presentation as JSON.
Return ONLY valid JSON — no markdown, no code fences, no truncation.

Schema:
{
  "title": "Presentation Title",
  "subtitle": "Optional subtitle",
  "slides": [
    { "type": "title",   "title": "...", "subtitle": "..." },
    { "type": "content", "title": "...", "bullets": ["...", "..."] },
    { "type": "two_col", "title": "...", "left": { "heading": "...", "bullets": ["..."] }, "right": { "heading": "...", "bullets": ["..."] } },
    { "type": "quote",   "quote": "...", "attribution": "..." },
    { "type": "closing", "title": "...", "subtitle": "..." }
  ]
}

CRITICAL RULES — you MUST follow all of these:
1. The "slides" array MUST contain EXACTLY ${numSlides} objects. Do NOT stop early. Output every single slide.
2. First slide MUST be type "title". Last slide MUST be type "closing".
3. Fill all ${numSlides - 2} middle slides with a mix of "content", "two_col", and "quote" types — vary them.
4. Bullets: 3-5 per content slide, each under 12 words. Clear, professional, actionable.
5. Never truncate the JSON. Complete the full "slides" array and close all braces.
${imgRule}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TitleSlide   { type: "title";   title: string; subtitle?: string }
interface ContentSlide { type: "content"; title: string; bullets: string[]; imageQuery?: string }
interface TwoColSlide  { type: "two_col"; title: string; left: { heading: string; bullets: string[] }; right: { heading: string; bullets: string[] } }
interface QuoteSlide   { type: "quote";   quote: string; attribution?: string }
interface ClosingSlide { type: "closing"; title: string; subtitle?: string }
type Slide = TitleSlide | ContentSlide | TwoColSlide | QuoteSlide | ClosingSlide;
interface PresentationSpec { title: string; subtitle?: string; slides: Slide[] }

// ── Themes ────────────────────────────────────────────────────────────────────

const THEMES: Record<string, {
  bg: string; accent: string; text: string; dim: string; card: string;
  layout: "band" | "card" | "sidebar" | "bold" | "minimal";
  htmlTransition: string;
  font: string;        // pptxgenjs fontFace (cross-platform system font)
  htmlFont: string;    // Google Fonts family name
  htmlFontUrl: string; // Google Fonts CSS URL
}> = {
  professional: { bg: "0B0718", accent: "A855F7", text: "FFFFFF", dim: "A0A0B0", card: "1A1030", layout: "band",    htmlTransition: "cube",    font: "Calibri",       htmlFont: "Inter",             htmlFontUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap"               },
  ocean:        { bg: "061525", accent: "38BDF8", text: "FFFFFF", dim: "94A3B8", card: "0F2030", layout: "card",    htmlTransition: "concave", font: "Trebuchet MS",  htmlFont: "Poppins",           htmlFontUrl: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap"             },
  forest:       { bg: "0A1F0F", accent: "4ADE80", text: "FFFFFF", dim: "86EFAC", card: "122018", layout: "sidebar", htmlTransition: "zoom",    font: "Georgia",       htmlFont: "Merriweather",      htmlFontUrl: "https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap" },
  ember:        { bg: "1A0A00", accent: "F97316", text: "FFFFFF", dim: "FBB48C", card: "251505", layout: "bold",    htmlTransition: "convex",  font: "Arial Black",   htmlFont: "Oswald",            htmlFontUrl: "https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap"                  },
  clean:        { bg: "F8F8FC", accent: "7C3AED", text: "111120", dim: "666680", card: "FFFFFF", layout: "minimal", htmlTransition: "slide",   font: "Century Gothic", htmlFont: "Plus+Jakarta+Sans", htmlFontUrl: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap"   },
};

// ── Image fetching (keyed by slide index → always unique) ─────────────────────

async function fetchImageBase64(query: string, slideIndex: number): Promise<string | null> {
  try {
    const keyword = encodeURIComponent(query.trim().replace(/\s+/g, ","));
    // Use slide index as loremflickr lock seed → guaranteed different image per slide
    const url = `https://loremflickr.com/800/500/${keyword}?lock=${slideIndex * 97 + 31}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 9000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

// ── PPTX builder ─────────────────────────────────────────────────────────────

// imageMap is keyed by SLIDE INDEX (not query string) → each slide always unique
async function buildPptx(
  spec: PresentationSpec,
  themeName: string,
  imageMap: Record<number, string>,
): Promise<string> {
  const t = THEMES[themeName] ?? THEMES["professional"]!;
  const layout = t.layout;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = spec.title;
  pptx.author = "Emma AI · Emperial Intelligence";

  const W = 13.33, H = 7.5, M = 0.55;

  for (const [slideIndex, slide] of spec.slides.entries()) {
    const s = pptx.addSlide();

    // ── Global background ────────────────────────────────────────────────────
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: t.bg }, line: { color: t.bg } });

    // ── Layout-specific accent decoration ───────────────────────────────────
    if (layout === "band" || layout === "card") {
      // Top accent strip
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.05, fill: { color: t.accent }, line: { color: t.accent } });
    } else if (layout === "sidebar" || layout === "bold") {
      // Left accent bar
      const barW = layout === "sidebar" ? 1.2 : 0.44;
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: barW, h: H, fill: { color: t.accent }, line: { color: t.accent } });
      // Separator
      if (layout === "sidebar") {
        s.addShape(pptx.ShapeType.rect, { x: barW, y: 0, w: 0.03, h: H, fill: { color: t.card }, line: { color: t.card } });
      }
    } else if (layout === "minimal") {
      // Bottom accent strip only
      s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.04, w: W, h: 0.04, fill: { color: t.accent }, line: { color: t.accent } });
    }

    // Content X offset for sidebar/bold themes
    const cxOffset = layout === "sidebar" ? 1.28 : layout === "bold" ? 0.58 : 0;
    const cxW = W - cxOffset;

    // ── TITLE slide ──────────────────────────────────────────────────────────
    if (slide.type === "title") {
      if (layout === "sidebar" || layout === "bold") {
        // Side-panel title: brand in accent bar, title in main area
        s.addText("EMMA", { x: 0.1, y: H * 0.38, w: cxOffset - 0.15, h: 0.4, fontSize: 16, bold: true, color: t.bg, fontFace: t.font, align: "center" });
        s.addText("AI", { x: 0.1, y: H * 0.38 + 0.45, w: cxOffset - 0.15, h: 0.3, fontSize: 11, color: t.bg, fontFace: t.font, align: "center" });
        s.addShape(pptx.ShapeType.rect, { x: cxOffset + 0.1, y: H * 0.2, w: cxW - M, h: 0.06, fill: { color: t.accent }, line: { color: t.accent } });
        s.addText(slide.title, { x: cxOffset + 0.1, y: H * 0.28, w: cxW - M, h: H * 0.38, fontSize: 34, bold: true, color: t.text, fontFace: t.font, align: "left", valign: "middle", wrap: true });
        if (slide.subtitle) s.addText(slide.subtitle, { x: cxOffset + 0.1, y: H * 0.68, w: cxW - M, h: 0.7, fontSize: 16, color: t.dim, fontFace: t.font, align: "left", wrap: true });
      } else if (layout === "minimal") {
        s.addText("EMMA AI", { x: M, y: H * 0.3, w: W - M * 2, h: 0.4, fontSize: 13, bold: true, color: t.accent, fontFace: t.font, align: "center", charSpacing: 5 });
        s.addShape(pptx.ShapeType.rect, { x: W * 0.35, y: H * 0.37, w: W * 0.3, h: 0.025, fill: { color: t.accent }, line: { color: t.accent } });
        s.addText(slide.title, { x: M, y: H * 0.4, w: W - M * 2, h: H * 0.3, fontSize: 38, bold: true, color: t.text, fontFace: t.font, align: "center", valign: "middle", wrap: true });
        if (slide.subtitle) s.addText(slide.subtitle, { x: M, y: H * 0.73, w: W - M * 2, h: 0.6, fontSize: 17, color: t.dim, fontFace: t.font, align: "center", wrap: true });
      } else {
        // band / card: split layout
        s.addShape(pptx.ShapeType.rect, { x: W * 0.35, y: 0, w: W * 0.65, h: H, fill: { color: t.card }, line: { color: t.card } });
        s.addShape(pptx.ShapeType.rect, { x: W * 0.35, y: 0, w: 0.06, h: H, fill: { color: t.accent }, line: { color: t.accent } });
        s.addText("EMMA", { x: M, y: H * 0.38, w: W * 0.28, h: 0.4, fontSize: 22, bold: true, color: t.accent, fontFace: t.font, align: "left" });
        s.addText("AI Presentation", { x: M, y: H * 0.38 + 0.44, w: W * 0.28, h: 0.3, fontSize: 12, color: t.dim, fontFace: t.font, align: "left" });
        s.addText(slide.title, { x: W * 0.38, y: H * 0.2, w: W * 0.58, h: H * 0.42, fontSize: 36, bold: true, color: t.text, fontFace: t.font, align: "left", valign: "middle", wrap: true });
        if (slide.subtitle) s.addText(slide.subtitle, { x: W * 0.38, y: H * 0.64, w: W * 0.58, h: 0.7, fontSize: 16, color: t.dim, fontFace: t.font, align: "left", wrap: true });
      }

    // ── CONTENT slide ────────────────────────────────────────────────────────
    } else if (slide.type === "content") {
      const imgData = imageMap[slideIndex] ?? null;

      if (layout === "band") {
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0.05, w: W, h: 1.15, fill: { color: t.card }, line: { color: t.card } });
        s.addText(slide.title, { x: M, y: 0.2, w: W - M * 2, h: 0.88, fontSize: 28, bold: true, color: t.text, fontFace: t.font, valign: "middle" });
        s.addShape(pptx.ShapeType.rect, { x: M, y: 1.14, w: 0.5, h: 0.05, fill: { color: t.accent }, line: { color: t.accent } });
      } else if (layout === "card") {
        // Inset header card (not full bleed)
        s.addShape(pptx.ShapeType.rect, { x: 0.28, y: 0.22, w: W - 0.56, h: 1.08, fill: { color: t.card }, line: { color: t.card } });
        s.addShape(pptx.ShapeType.rect, { x: 0.28, y: 0.22, w: 0.06, h: 1.08, fill: { color: t.accent }, line: { color: t.accent } });
        s.addText(slide.title, { x: 0.5, y: 0.32, w: W - 1.1, h: 0.78, fontSize: 26, bold: true, color: t.text, fontFace: t.font, valign: "middle" });
        // Circular badge top-right
        s.addShape(pptx.ShapeType.ellipse, { x: W - 0.7, y: 0.12, w: 0.5, h: 0.5, fill: { color: t.card }, line: { color: t.accent } });
        s.addText(`${slideIndex}`, { x: W - 0.7, y: 0.12, w: 0.5, h: 0.5, fontSize: 13, bold: true, color: t.accent, fontFace: t.font, align: "center", valign: "middle" });
      } else if (layout === "sidebar") {
        s.addText(slide.title, { x: cxOffset + 0.15, y: 0.28, w: cxW - 0.4, h: 0.9, fontSize: 24, bold: true, color: t.text, fontFace: t.font, valign: "middle", wrap: true });
        s.addShape(pptx.ShapeType.rect, { x: cxOffset + 0.15, y: 1.15, w: 0.5, h: 0.04, fill: { color: t.accent }, line: { color: t.accent } });
        // Sidebar label (rotated text not supported, use short label)
        s.addText(String(slideIndex).padStart(2, "0"), { x: 0.1, y: H * 0.48, w: cxOffset - 0.2, h: 0.4, fontSize: 18, bold: true, color: t.bg, fontFace: t.font, align: "center" });
      } else if (layout === "bold") {
        s.addText(slide.title, { x: cxOffset + 0.15, y: 0.22, w: cxW - 0.4, h: 1.0, fontSize: 26, bold: true, color: t.text, fontFace: t.font, valign: "middle", wrap: true });
        s.addShape(pptx.ShapeType.rect, { x: cxOffset + 0.15, y: 1.18, w: 0.5, h: 0.06, fill: { color: t.accent }, line: { color: t.accent } });
        // Bottom accent strip
        s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.22, w: W, h: 0.22, fill: { color: t.card }, line: { color: t.card } });
      } else if (layout === "minimal") {
        s.addText(slide.title, { x: M, y: 0.6, w: W - M * 2, h: 0.8, fontSize: 28, bold: true, color: t.text, fontFace: t.font, valign: "middle" });
        s.addShape(pptx.ShapeType.rect, { x: M, y: 1.4, w: W - M * 2, h: 0.018, fill: { color: t.accent + "60" }, line: { color: t.accent + "60" } });
      }

      // Bullets (common across all layouts, adjusted for cxOffset)
      const bx = layout === "sidebar" ? cxOffset + 0.15
               : layout === "bold"    ? cxOffset + 0.15
               : layout === "minimal" ? M
               : layout === "card"    ? 0.5
               : M;
      const bStartY = layout === "minimal" ? 1.52 : 1.46;
      const hasImg = !!imgData;
      const bulletAreaW = hasImg
        ? (layout === "sidebar" || layout === "bold" ? cxW * 0.55 : W * 0.50 - bx)
        : (layout === "sidebar" || layout === "bold" ? cxW - 0.4 : W - bx - M - 0.3);
      const bullets = (slide.bullets ?? []).slice(0, 6);
      const spacing = Math.min(0.9, (H - bStartY - 0.55) / Math.max(bullets.length, 1));
      const fontSize = hasImg ? 16 : (layout === "minimal" ? 19 : 18);

      bullets.forEach((b, i) => {
        if (layout === "minimal") {
          s.addText(`— ${b}`, { x: bx, y: bStartY + i * spacing, w: bulletAreaW, h: spacing, fontSize, color: t.text, fontFace: t.font, valign: "middle", wrap: true });
        } else if (layout === "card") {
          s.addShape(pptx.ShapeType.rect, { x: bx, y: bStartY + i * spacing + spacing * 0.4, w: 0.1, h: 0.1, fill: { color: t.accent }, line: { color: t.accent } });
          s.addText(b, { x: bx + 0.24, y: bStartY + i * spacing, w: bulletAreaW, h: spacing, fontSize, color: t.text, fontFace: t.font, valign: "middle", wrap: true });
        } else {
          s.addShape(pptx.ShapeType.ellipse, { x: bx, y: bStartY + i * spacing + spacing * 0.38, w: 0.12, h: 0.12, fill: { color: t.accent }, line: { color: t.accent } });
          s.addText(b, { x: bx + 0.26, y: bStartY + i * spacing, w: bulletAreaW, h: spacing, fontSize, color: t.text, fontFace: t.font, valign: "middle", wrap: true });
        }
      });

      // Image panel
      if (imgData) {
        const imgX = layout === "sidebar" ? cxOffset + cxW * 0.58
                   : layout === "bold"    ? cxOffset + cxW * 0.58
                   : W * 0.54;
        const imgW = layout === "sidebar" || layout === "bold" ? cxW * 0.38 : W - imgX - 0.28;
        const imgH = H - bStartY - 0.35;
        s.addImage({ data: `image/jpeg;base64,${imgData}`, x: imgX, y: bStartY, w: imgW, h: imgH });
        s.addShape(pptx.ShapeType.rect, { x: imgX - 0.06, y: bStartY, w: 0.03, h: imgH, fill: { color: t.accent }, line: { color: t.accent } });
      }

    // ── TWO-COL slide ────────────────────────────────────────────────────────
    } else if (slide.type === "two_col") {
      const hdBg = layout === "minimal" ? t.bg : t.card;
      const hdH = 1.1;
      if (layout !== "minimal") {
        s.addShape(pptx.ShapeType.rect, { x: cxOffset, y: 0.05, w: cxW, h: hdH, fill: { color: hdBg }, line: { color: hdBg } });
      }
      s.addText(slide.title, { x: cxOffset + 0.15, y: 0.18, w: cxW - 0.4, h: 0.8, fontSize: 24, bold: true, color: t.text, fontFace: t.font, valign: "middle", wrap: true });
      if (layout === "minimal") {
        s.addShape(pptx.ShapeType.rect, { x: cxOffset + M, y: hdH + 0.05, w: cxW - M * 2, h: 0.018, fill: { color: t.accent + "50" }, line: { color: t.accent + "50" } });
      }
      const colW = (cxW - (cxOffset > 0 ? 0.15 : M) * 3) / 2;
      for (const [ci, col] of [[0, slide.left], [1, slide.right]] as [number, { heading: string; bullets: string[] }][]) {
        const cx = cxOffset + (cxOffset > 0 ? 0.15 : M) + ci * (colW + (cxOffset > 0 ? 0.15 : M));
        if (layout !== "minimal") {
          s.addShape(pptx.ShapeType.rect, { x: cx, y: 1.3, w: colW, h: H - 1.6, fill: { color: t.card }, line: { color: t.card } });
          s.addShape(pptx.ShapeType.rect, { x: cx, y: 1.3, w: colW, h: 0.06, fill: { color: t.accent }, line: { color: t.accent } });
        } else {
          s.addShape(pptx.ShapeType.rect, { x: cx, y: 1.32, w: 0.3, h: 0.025, fill: { color: t.accent }, line: { color: t.accent } });
        }
        s.addText(col.heading, { x: cx + 0.18, y: 1.38, w: colW - 0.35, h: 0.5, fontSize: 15, bold: true, color: t.accent, fontFace: t.font });
        col.bullets.slice(0, 5).forEach((b, i) => {
          s.addText(`• ${b}`, { x: cx + 0.18, y: 1.96 + i * 0.62, w: colW - 0.35, h: 0.56, fontSize: 15, color: t.text, fontFace: t.font, wrap: true });
        });
      }

    // ── QUOTE slide ──────────────────────────────────────────────────────────
    } else if (slide.type === "quote") {
      s.addText("\u201C", { x: M, y: H * 0.08, w: 2, h: 2, fontSize: 120, color: t.accent, fontFace: "Georgia", align: "left" });
      s.addText(slide.quote, { x: M + 0.3, y: H * 0.24, w: W - M * 2 - 0.4, h: H * 0.46, fontSize: 28, italic: true, color: t.text, fontFace: "Georgia", align: "center", valign: "middle", wrap: true });
      s.addShape(pptx.ShapeType.rect, { x: W / 2 - 0.4, y: H * 0.69, w: 0.8, h: 0.04, fill: { color: t.accent }, line: { color: t.accent } });
      if (slide.attribution) s.addText(`\u2014 ${slide.attribution}`, { x: M, y: H * 0.73, w: W - M * 2, h: 0.4, fontSize: 16, color: t.dim, fontFace: t.font, align: "center" });

    // ── CLOSING slide ────────────────────────────────────────────────────────
    } else if (slide.type === "closing") {
      if (layout === "sidebar" || layout === "bold") {
        s.addText(slide.title, { x: cxOffset + 0.15, y: H * 0.28, w: cxW - 0.4, h: 1.3, fontSize: 46, bold: true, color: t.text, fontFace: t.font, align: "left", valign: "middle" });
        if (slide.subtitle) s.addText(slide.subtitle, { x: cxOffset + 0.15, y: H * 0.58, w: cxW - 0.4, h: 0.7, fontSize: 17, color: t.dim, fontFace: t.font, align: "left" });
      } else {
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0.05, w: W, h: H, fill: { color: t.card }, line: { color: t.card } });
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0.05, w: W, h: 0.06, fill: { color: t.accent }, line: { color: t.accent } });
        s.addText(slide.title, { x: M, y: H * 0.28, w: W - M * 2, h: 1.3, fontSize: 52, bold: true, color: t.text, fontFace: t.font, align: "center", valign: "middle" });
        if (slide.subtitle) s.addText(slide.subtitle, { x: M, y: H * 0.56, w: W - M * 2, h: 0.7, fontSize: 18, color: t.dim, fontFace: t.font, align: "center" });
      }
      s.addText("Created by Emma AI · Emperial Intelligence", { x: M, y: H - 0.52, w: W - M * 2, h: 0.32, fontSize: 11, color: t.dim, fontFace: t.font, align: "center" });
    }

    // Slide number (not on title slides, and not on sidebar where we use the numbered badge)
    if (slide.type !== "title" && layout !== "sidebar") {
      const n = slideIndex + 1;
      s.addText(`${n}`, { x: W - 0.62, y: H - 0.45, w: 0.42, h: 0.3, fontSize: 11, color: t.dim, fontFace: t.font, align: "right" });
    }
  }

  const result = await pptx.write({ outputType: "base64" });
  return result as string;
}

// ── HTML animated builder ─────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildHtml(spec: PresentationSpec, themeName: string, enable3D: boolean): string {
  const t = THEMES[themeName] ?? THEMES["professional"]!;
  const isDark = themeName !== "clean";
  const accentDec = parseInt(t.accent, 16);

  // Per-slide HTML
  const slidesHtml = spec.slides.map((slide, idx) => {
    if (slide.type === "title") {
      return `<section class="sl sl-title">
  <span class="badge">EMMA · AI PRESENTATION</span>
  <h1 class="main-title">${escHtml(slide.title)}</h1>
  ${slide.subtitle ? `<p class="main-sub">${escHtml(slide.subtitle)}</p>` : ""}
  <div class="title-ring ring-1"></div>
  <div class="title-ring ring-2"></div>
</section>`;
    }
    if (slide.type === "content") {
      const bullets = (slide.bullets ?? []).slice(0, 6);
      return `<section class="sl sl-content">
  <div class="slide-hd"><h2>${escHtml(slide.title)}</h2><div class="hd-bar"></div></div>
  <ul class="bullets">${bullets.map((b, i) => `<li class="fragment" data-fragment-index="${i}">${escHtml(b)}</li>`).join("")}</ul>
  <div class="slide-num">${idx + 1}</div>
</section>`;
    }
    if (slide.type === "two_col") {
      const lBullets = slide.left.bullets.map((b, i) => `<li class="fragment" data-fragment-index="${i}">${escHtml(b)}</li>`).join("");
      const rBullets = slide.right.bullets.map((b, i) => `<li class="fragment" data-fragment-index="${i + slide.left.bullets.length}">${escHtml(b)}</li>`).join("");
      return `<section class="sl sl-two-col">
  <div class="slide-hd"><h2>${escHtml(slide.title)}</h2><div class="hd-bar"></div></div>
  <div class="cols">
    <div class="col"><div class="col-hd">${escHtml(slide.left.heading)}</div><ul>${lBullets}</ul></div>
    <div class="col-div"></div>
    <div class="col"><div class="col-hd">${escHtml(slide.right.heading)}</div><ul>${rBullets}</ul></div>
  </div>
  <div class="slide-num">${idx + 1}</div>
</section>`;
    }
    if (slide.type === "quote") {
      return `<section class="sl sl-quote">
  <div class="qmark">\u201C</div>
  <blockquote>${escHtml(slide.quote)}</blockquote>
  ${slide.attribution ? `<cite>\u2014 ${escHtml(slide.attribution)}</cite>` : ""}
</section>`;
    }
    if (slide.type === "closing") {
      return `<section class="sl sl-closing">
  <h1>${escHtml(slide.title)}</h1>
  ${slide.subtitle ? `<p>${escHtml(slide.subtitle)}</p>` : ""}
  <div class="byline">Created by Emma AI &middot; Emperial Intelligence</div>
</section>`;
    }
    return `<section><p>${escHtml(String(slide))}</p></section>`;
  }).join("\n");

  const threeJs = enable3D ? `
const c3=document.getElementById('c3d');
const r3=new THREE.WebGLRenderer({canvas:c3,alpha:true,antialias:true});
r3.setSize(innerWidth,innerHeight);r3.setPixelRatio(Math.min(devicePixelRatio,2));
const sc3=new THREE.Scene();
const cm3=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,0.1,500);
cm3.position.z=6;
const N=500,PHI=Math.PI*(3-Math.sqrt(5)),pos=[];
for(let i=0;i<N;i++){const y=1-(i/(N-1))*2,r=Math.sqrt(1-y*y),th=PHI*i;pos.push(r*Math.cos(th)*3.2,y*3.2,r*Math.sin(th)*3.2);}
const g3=new THREE.BufferGeometry();
g3.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
const m3=new THREE.PointsMaterial({color:${accentDec},size:0.055,transparent:true,opacity:0.45});
const pts=new THREE.Points(g3,m3);sc3.add(pts);
const ringMat=new THREE.MeshBasicMaterial({color:${accentDec},transparent:true,opacity:0.18,wireframe:false});
[[2.3,0.014,Math.PI/4,0,0],[3.5,0.009,Math.PI/6,Math.PI/5,0],[1.5,0.018,Math.PI*0.7,0,Math.PI/3]].forEach(([rad,tube,rx,ry,rz])=>{
  const rg=new THREE.TorusGeometry(rad,tube,6,90);
  const rng=new THREE.Mesh(rg,ringMat.clone());
  rng.rotation.set(rx,ry,rz);sc3.add(rng);
});
let t3=0;
function a3(){
  requestAnimationFrame(a3);t3+=0.01;
  pts.rotation.y+=0.002;pts.rotation.x+=0.0007;
  sc3.children.forEach((ch,i)=>{if(i>0)ch.rotation.z+=i%2===0?0.004:-0.003;});
  r3.render(sc3,cm3);
}
a3();
window.addEventListener('resize',()=>{cm3.aspect=innerWidth/innerHeight;cm3.updateProjectionMatrix();r3.setSize(innerWidth,innerHeight);});
` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>${escHtml(spec.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${t.htmlFontUrl}">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1/dist/reveal.css">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'${t.htmlFont}',system-ui,sans-serif}
body,html{background:#${t.bg};overflow:hidden;height:100%}
.reveal,.reveal .slides{background:transparent!important}
.reveal .slides{text-align:left}
.reveal section{padding:0!important;height:100vh}
/* Three.js canvas */
#c3d{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;opacity:.8}
.reveal .slides{z-index:1;position:relative}
/* ── Title ── */
.sl-title{display:flex!important;flex-direction:column;justify-content:center;padding:10vh 10vw!important;background:linear-gradient(135deg,#${t.bg} 0%,#${t.card} 100%)!important;position:relative;overflow:hidden}
.badge{display:inline-block;color:#${t.accent};font-size:clamp(10px,1.1vw,13px);font-weight:700;letter-spacing:.22em;padding:5px 14px;border:1px solid #${t.accent}55;border-radius:3px;width:fit-content;margin-bottom:3.5vh;animation:fadeUp .9s cubic-bezier(.23,1,.32,1) both}
.main-title{font-size:clamp(32px,5.5vw,82px);font-weight:800;color:#${t.text};line-height:1.05;letter-spacing:-.03em;margin-bottom:2.5vh;animation:fadeUp .9s cubic-bezier(.23,1,.32,1) .08s both}
.main-sub{font-size:clamp(15px,1.9vw,25px);color:#${t.dim};font-weight:400;animation:fadeUp .9s cubic-bezier(.23,1,.32,1) .18s both}
.title-ring{position:absolute;border-radius:50%;border:1.5px solid #${t.accent}22;pointer-events:none}
.ring-1{right:-8vw;top:50%;transform:translateY(-50%);width:clamp(200px,40vw,600px);height:clamp(200px,40vw,600px);animation:spin 28s linear infinite}
.ring-2{right:-4vw;top:50%;transform:translateY(-50%);width:clamp(120px,25vw,380px);height:clamp(120px,25vw,380px);border-color:#${t.accent}38;animation:spin 18s linear infinite reverse}
/* ── Content ── */
.sl-content{display:flex!important;flex-direction:column}
.slide-hd{background:#${t.card};padding:3vh 7vw 2.5vh;flex-shrink:0;border-left:4px solid #${t.accent}}
.slide-hd h2{font-size:clamp(20px,3.2vw,44px);font-weight:700;color:#${t.text};letter-spacing:-.02em;animation:slideLeft .8s cubic-bezier(.23,1,.32,1) both}
.hd-bar{width:50px;height:3px;background:#${t.accent};border-radius:2px;margin-top:10px;animation:barGrow .7s cubic-bezier(.23,1,.32,1) .12s both}
.bullets{list-style:none;padding:3.5vh 7vw;flex:1;display:flex;flex-direction:column;justify-content:center;gap:2.2vh}
.bullets li{font-size:clamp(14px,1.95vw,26px);color:#${t.text};padding-left:1.5em;position:relative;line-height:1.4;font-weight:400}
.bullets li::before{content:"";position:absolute;left:0;top:.55em;width:.5em;height:.5em;border-radius:50%;background:#${t.accent};transform:translateY(-10%)}
/* ── Two-col ── */
.sl-two-col{display:flex!important;flex-direction:column}
.sl-two-col .slide-hd{background:#${t.card};padding:3vh 7vw 2.5vh;border-left:4px solid #${t.accent}}
.sl-two-col .slide-hd h2{font-size:clamp(18px,2.8vw,38px);font-weight:700;color:#${t.text};letter-spacing:-.02em}
.cols{display:flex;flex:1;overflow:hidden}
.col{flex:1;padding:3.5vh 4.5vw;display:flex;flex-direction:column}
.col-div{width:1px;background:#${t.accent}25;margin:3vh 0;flex-shrink:0}
.col-hd{font-size:clamp(11px,1.4vw,18px);font-weight:700;color:#${t.accent};text-transform:uppercase;letter-spacing:.08em;margin-bottom:1.8vh;padding-bottom:.8vh;border-bottom:2px solid #${t.accent}30}
.col ul{list-style:none;display:flex;flex-direction:column;gap:1.5vh}
.col li{font-size:clamp(12px,1.55vw,21px);color:#${t.text};padding-left:1.3em;position:relative;line-height:1.4}
.col li::before{content:"•";position:absolute;left:0;color:#${t.accent}}
/* ── Quote ── */
.sl-quote{display:flex!important;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:8vh 12vw!important}
.qmark{font-size:clamp(70px,11vw,140px);color:#${t.accent};opacity:.3;font-family:Georgia,serif;line-height:.65;align-self:flex-start;animation:fadeInSlow 1s ease both}
.sl-quote blockquote{font-size:clamp(17px,2.6vw,38px);color:#${t.text};font-style:italic;font-family:Georgia,serif;line-height:1.5;margin:2vh 0;animation:fadeUp .9s cubic-bezier(.23,1,.32,1) .1s both}
.sl-quote cite{font-size:clamp(12px,1.3vw,18px);color:#${t.dim};margin-top:2.5vh;display:block;letter-spacing:.04em;animation:fadeUp .9s cubic-bezier(.23,1,.32,1) .2s both}
/* ── Closing ── */
.sl-closing{display:flex!important;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:8vh 10vw!important;background:linear-gradient(135deg,#${t.card} 0%,#${t.bg} 100%)!important}
.sl-closing h1{font-size:clamp(38px,6.5vw,94px);font-weight:800;color:#${t.text};letter-spacing:-.04em;line-height:1;margin-bottom:2.5vh;animation:scaleIn 1s cubic-bezier(.23,1,.32,1) both}
.sl-closing p{font-size:clamp(15px,1.9vw,26px);color:#${t.dim};margin-bottom:2.5vh;animation:fadeUp .9s cubic-bezier(.23,1,.32,1) .15s both}
.byline{position:absolute;bottom:3vh;font-size:clamp(9px,.9vw,12px);color:#${t.dim};opacity:.4;letter-spacing:.05em}
/* ── Slide number ── */
.slide-num{position:absolute;bottom:2.8vh;right:3vw;font-size:12px;color:#${t.dim};opacity:.4;font-weight:500;letter-spacing:.04em}
/* ── Fragments ── */
.reveal .fragment{opacity:0;transition:none}
.reveal .fragment.visible{opacity:1;animation:bulletIn .6s cubic-bezier(.23,1,.32,1) both}
/* ── Keyframes ── */
@keyframes fadeUp{from{opacity:0;transform:translateY(26px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes slideLeft{from{opacity:0;transform:translateX(-22px)}to{opacity:1;transform:translateX(0)}}
@keyframes barGrow{from{width:0;opacity:0}to{width:50px;opacity:1}}
@keyframes bulletIn{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:translateX(0)}}
@keyframes fadeInSlow{from{opacity:0}to{opacity:.3}}
@keyframes scaleIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
@keyframes spin{to{transform:translateY(-50%) rotate(360deg)}}
/* Reveal overrides */
.reveal .controls{color:#${t.accent}!important}
.reveal .progress{color:#${t.accent}!important}
</style>
</head>
<body>
${enable3D ? '<canvas id="c3d"></canvas>' : ""}
<div class="reveal">
<div class="slides">
${slidesHtml}
</div>
</div>
${enable3D ? '<script src="https://cdn.jsdelivr.net/npm/three@0.162/build/three.min.js"></script>' : ""}
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1/dist/reveal.js"></script>
<script>
Reveal.initialize({
  hash:true,
  transition:'${t.htmlTransition}',
  transitionSpeed:'slow',
  backgroundTransition:'fade',
  center:false,
  margin:0,
  width:'100%',
  height:'100%',
  minScale:1,
  maxScale:1,
  controls:true,
  controlsLayout:'bottom-right',
  progress:true,
  keyboard:true,
  touch:true,
});
${threeJs}
</script>
</body>
</html>`;
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post("/presentation", async (req, res) => {
  const {
    topic,
    style = "professional",
    numSlides = 8,
    context,
    useImages = false,
    format = "pptx",
    enable3D = false,
  } = req.body as {
    topic?: string; style?: string; numSlides?: number; context?: string;
    useImages?: boolean; format?: "pptx" | "html"; enable3D?: boolean;
  };

  if (!topic?.trim()) { res.status(400).json({ error: "topic is required" }); return; }

  const themeName = Object.keys(THEMES).includes(style) ? style : "professional";
  const clampedSlides = Math.max(4, Math.min(60, numSlides));

  try {
    // 1. Generate slide content
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 6000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildPrompt(!!useImages, clampedSlides) },
        { role: "user", content: `Create a ${clampedSlides}-slide presentation about: "${topic}". Remember: the "slides" array must have EXACTLY ${clampedSlides} items — output all of them.${context ? `\n\nAdditional context:\n${context}` : ""}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let spec: PresentationSpec;
    try { spec = JSON.parse(raw) as PresentationSpec; }
    catch { res.status(500).json({ error: "Failed to parse AI response" }); return; }
    if (!spec.slides?.length) { res.status(500).json({ error: "No slides generated" }); return; }

    const safeName = (topic ?? "presentation").slice(0, 40).replace(/[^a-zA-Z0-9 -]/g, "").trim().replace(/\s+/g, "_");

    // 2. HTML format
    if (format === "html") {
      const html = buildHtml(spec, themeName, !!enable3D);
      const base64 = Buffer.from(html, "utf-8").toString("base64");
      res.json({ title: spec.title, slideCount: spec.slides.length, theme: themeName, filename: `${safeName}.html`, file: base64, format: "html", imagesUsed: 0 });
      return;
    }

    // 3. Fetch images in parallel — keyed by SLIDE INDEX (guarantees uniqueness)
    const imageMap: Record<number, string> = {};
    if (useImages) {
      const queries = spec.slides
        .map((sl, slideIdx) => ({ sl, slideIdx }))
        .filter((x): x is { sl: ContentSlide; slideIdx: number } =>
          x.sl.type === "content" && !!(x.sl as ContentSlide).imageQuery
        )
        .map(({ sl, slideIdx }) => ({ q: (sl as ContentSlide).imageQuery!, slideIdx }));

      const results = await Promise.allSettled(
        queries.map(({ q, slideIdx }) =>
          fetchImageBase64(q, slideIdx).then((b64) => ({ slideIdx, b64 }))
        ),
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.b64) {
          imageMap[r.value.slideIdx] = r.value.b64;
        }
      }
    }

    // 4. Build .pptx
    const base64 = await buildPptx(spec, themeName, imageMap);
    const imagesUsed = Object.keys(imageMap).length;

    res.json({ title: spec.title, slideCount: spec.slides.length, theme: themeName, filename: `${safeName}.pptx`, file: base64, format: "pptx", imagesUsed });
  } catch (err) {
    req.log.error(err, "generate presentation");
    res.status(500).json({ error: "Failed to generate presentation" });
  }
});

export default router;
