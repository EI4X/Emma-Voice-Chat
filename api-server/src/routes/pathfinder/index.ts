import { openrouter } from "@workspace/integrations-openrouter-ai";
import { db } from "@workspace/db";
import { missions, missionSteps } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDefaultSteps(category: string): string[] {
  const map: Record<string, string[]> = {
    general:      ["Define scope and objectives", "Research and gather information", "Create initial draft", "Review and refine", "Execute", "Monitor progress", "Complete and review"],
    funding:      ["Research funding sources", "Define project budget", "Draft funding proposal", "Prepare supporting documents", "Submit application", "Follow up with funders", "Track decision"],
    presentation: ["Define audience and goals", "Outline key messages", "Gather data and visuals", "Build slide deck", "Rehearse delivery", "Gather feedback", "Final review"],
    research:     ["Define research question", "Literature review", "Collect data and sources", "Analyze findings", "Draft summary", "Peer review", "Finalize report"],
    meeting:      ["Define meeting agenda", "Invite participants", "Prepare materials", "Run the meeting", "Record notes and decisions", "Send follow-up email", "Track action items"],
    project:      ["Define project scope", "Break into milestones", "Assign responsibilities", "Set timeline", "Execute phase 1", "Review and iterate", "Project close-out"],
    travel:       ["Research destination", "Book flights", "Book accommodation", "Plan itinerary", "Prepare documents", "Pack essentials", "Confirm all bookings"],
    campaign:     ["Define campaign goals", "Identify target audience", "Create content plan", "Design assets", "Set up channels", "Launch campaign", "Monitor and optimize"],
    launch:       ["Define launch goals", "Build launch checklist", "Prepare marketing materials", "Notify stakeholders", "Execute launch", "Monitor feedback", "Post-launch review"],
  };
  return map[category] ?? map.general!;
}

const MISSION_MODEL = "meta-llama/llama-4-maverick";

// ── Missions CRUD ─────────────────────────────────────────────────────────────

router.get("/missions", async (req, res) => {
  try {
    const rows = await db.select().from(missions).orderBy(desc(missions.createdAt));
    const allSteps = rows.length
      ? await db.select().from(missionSteps).orderBy(missionSteps.order)
      : [];
    res.json({ missions: rows.map((m) => ({ ...m, steps: allSteps.filter((s) => s.missionId === m.id) })) });
  } catch (err) {
    req.log.error(err, "fetch missions");
    res.status(500).json({ error: "Failed to fetch missions" });
  }
});

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  category: z.string().default("general"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  deadline: z.string().optional(),
});

router.post("/missions", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { title, description, category, priority, deadline } = parsed.data;

  try {
    const [mission] = await db.insert(missions).values({
      title, description, category, priority,
      deadline: deadline ? new Date(deadline) : undefined,
      status: "active",
    }).returning();
    if (!mission) { res.status(500).json({ error: "Insert failed" }); return; }

    const stepTitles = getDefaultSteps(category);
    const insertedSteps = (
      await Promise.all(stepTitles.map((t, i) =>
        db.insert(missionSteps).values({ missionId: mission.id, title: t, order: i }).returning()
      ))
    ).flatMap((r) => r).filter(Boolean);

    res.status(201).json({ mission: { ...mission, steps: insertedSteps } });
  } catch (err) {
    req.log.error(err, "create mission");
    res.status(500).json({ error: "Failed to create mission" });
  }
});

router.patch("/missions/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (body.status)      updates.status = body.status;
  if (body.title)       updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.priority)    updates.priority = body.priority;
  if (body.deadline)    updates.deadline = new Date(body.deadline as string);
  if (body.status === "completed") updates.completedAt = new Date();
  try {
    const [updated] = await db.update(missions).set(updates).where(eq(missions.id, id)).returning();
    res.json({ mission: updated });
  } catch (err) {
    req.log.error(err, "update mission");
    res.status(500).json({ error: "Failed to update mission" });
  }
});

router.delete("/missions/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(missions).where(eq(missions.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "delete mission");
    res.status(500).json({ error: "Failed to delete mission" });
  }
});

router.patch("/missions/:missionId/steps/:stepId", async (req, res) => {
  const missionId = parseInt(req.params.missionId ?? "", 10);
  const stepId = parseInt(req.params.stepId ?? "", 10);
  if (isNaN(missionId) || isNaN(stepId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (body.completed !== undefined) updates.completed = body.completed;
  if (body.title) updates.title = body.title;
  try {
    const [updated] = await db.update(missionSteps)
      .set(updates)
      .where(eq(missionSteps.id, stepId))
      .returning();
    if (updated && updated.missionId !== missionId) { res.status(404).json({ error: "Step not found" }); return; }
    res.json({ step: updated });
  } catch (err) {
    req.log.error(err, "update step");
    res.status(500).json({ error: "Failed to update step" });
  }
});

// ── Context Profile (in-memory, per-session) ──────────────────────────────────

const profiles = new Map<string, Record<string, unknown>>();

router.get("/context", (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress ?? "default";
  res.json({ profile: profiles.get(ip) ?? {} });
});

router.post("/context", (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress ?? "default";
  profiles.set(ip, req.body as Record<string, unknown>);
  res.json({ ok: true });
});

// ── Mission AI Briefing (SSE) ─────────────────────────────────────────────────

router.post("/missions/:id/plan", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [mission] = await db.select().from(missions).where(eq(missions.id, id));
  if (!mission) { res.status(404).json({ error: "Not found" }); return; }
  const steps = await db.select().from(missionSteps).where(eq(missionSteps.missionId, id)).orderBy(missionSteps.order);
  const done = steps.filter((s) => s.completed).length;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openrouter.chat.completions.create({
      model: MISSION_MODEL,
      stream: true,
      messages: [
        { role: "system", content: "You are Emma, an AI chief-of-staff in Pathfinder Mode. Give a concise, actionable mission briefing." },
        { role: "user", content: `Mission: "${mission.title}"\nDescription: ${mission.description}\nPriority: ${mission.priority}\nProgress: ${done}/${steps.length} steps\n\nSteps:\n${steps.map((s, i) => `${i + 1}. [${s.completed ? "x" : " "}] ${s.title}`).join("\n")}\n\nGive a 3-4 sentence briefing: current status, biggest risk, and the single most important next action.` },
      ],
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? "";
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  } catch (err) {
    req.log.error(err, "mission plan SSE");
  }
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

// ── Emma Sees: Context Analyzer ──────────────────────────────────────────────

const ANALYZE_PROMPT = `You are Emma's intelligence engine. Analyze the text below and return ONLY valid JSON (no markdown, no explanation) with this exact shape:
{
  "context": "<short title of what the user is doing>",
  "detected": ["<tag1>", "<tag2>"],
  "summary": "<1-2 sentences explaining the situation>",
  "risks": ["<risk 1>", "<risk 2>"],
  "opportunities": ["<opportunity 1>", "<opportunity 2>"],
  "actions": ["<action 1>", "<action 2>", "<action 3>"],
  "apps": ["<appKey1>", "<appKey2>", "<appKey3>"]
}

Rules:
- "detected" tags must be from: email, meeting, conference, follow-up, document, notes, social, content, shopping, travel, productivity, task, communication, finance, music, study, research, design, general
- "apps" must be from: gmail, outlook, notion, slack, teams, whatsapp, telegram, googledrive, googlecalendar, googlemaps, uber, airbnb, booking, instagram, tiktok, youtube, linkedin, amazon, todoist, trello, evernote, spotify, paypal, canva, chatgpt
- risks: specific, actionable risks (max 3, can be empty array)
- opportunities: specific actionable opportunities (max 3, can be empty array)
- actions: specific next steps user should take (max 4)
- apps: top 4-6 apps that would help the user act on this context
- Return ONLY the JSON object, nothing else`;

router.post("/analyze", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) { res.status(400).json({ error: "text required" }); return; }

  try {
    const completion = await openrouter.chat.completions.create({
      model: MISSION_MODEL,
      stream: false,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANALYZE_PROMPT },
        { role: "user", content: `Analyze this:\n\n${text.slice(0, 4000)}` },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { parsed = {}; }

    res.json({
      context:       parsed.context       ?? "General context",
      detected:      parsed.detected      ?? ["general"],
      summary:       parsed.summary       ?? "",
      risks:         parsed.risks         ?? [],
      opportunities: parsed.opportunities ?? [],
      actions:       parsed.actions       ?? [],
      apps:          parsed.apps          ?? [],
    });
  } catch (err) {
    req.log.error(err, "analyze context");
    res.status(500).json({ error: "Analysis failed" });
  }
});

// ── Conference Summary (SSE) ──────────────────────────────────────────────────

router.post("/conference/summarize", async (req, res) => {
  const { transcript } = req.body as { transcript?: string };
  if (!transcript) { res.status(400).json({ error: "transcript required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openrouter.chat.completions.create({
      model: MISSION_MODEL,
      stream: true,
      messages: [
        {
          role: "system",
          content: "You are Emma, an AI meeting assistant. Summarize the meeting with these sections:\n## Key Points\n## Decisions Made\n## Action Items\n## Follow-up Email Draft\n\nBe concise and practical.",
        },
        { role: "user", content: `Summarize this meeting transcript:\n\n${transcript}` },
      ],
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? "";
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  } catch (err) {
    req.log.error(err, "conference summarize SSE");
  }
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
