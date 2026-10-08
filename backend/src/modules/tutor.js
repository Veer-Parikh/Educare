import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { badRequest, forbidden, HttpError } from "../lib/errors.js";
import { parse, zObjectId, zOptText } from "../lib/http.js";
import { classAccess, findOr404 } from "../lib/access.js";
import { fileToParts } from "../lib/extract.js";
import { assertEnabled, generateText, streamText } from "../lib/gemini.js";
import { saveFiles } from "../lib/storage.js";
import { awardXp, XP } from "../lib/gamification.js";
import { classMaterialsContext } from "../ai/sources.js";
import { uploader } from "../middleware/upload.js";
import { chatLimiter } from "../middleware/rateLimit.js";

const router = Router();

export const MODES = ["explain", "socratic", "exam"];
const HISTORY_LIMIT = 24;

const MODE_PROMPTS = {
  explain: [
    "MODE: Explain.",
    "Teach clearly and patiently. Start from what the learner likely already knows, build up step by step, and use a concrete example or analogy.",
    "For problems, show the reasoning for each step, not just the result.",
    "End with one short check-for-understanding question.",
  ],
  socratic: [
    "MODE: Socratic coach.",
    "Do NOT give final answers or complete solutions, even if asked directly. Guide the learner to discover the answer themselves.",
    "Ask one focused guiding question at a time. Offer progressively stronger hints only when they are stuck.",
    "When they reach a correct insight, confirm it and ask them to state the next step.",
    "If they seem to be asking you to do graded homework for them, gently say you'll help them work it out instead.",
  ],
  exam: [
    "MODE: Exam prep.",
    "Be concise and high-yield: key definitions, formulas, common traps and how examiners phrase questions.",
    "Use short bullet lists and mnemonics where helpful. Offer to quiz the learner with a practice question.",
  ],
};

function systemPrompt({ user, mode, classroom, materials, studySet }) {
  const lines = [
    "You are EduCare Tutor, a warm, rigorous AI tutor for students and teachers.",
    `You are helping ${user.name} (${user.role === "TEACHER" ? "a teacher" : "a student"}).`,
    ...MODE_PROMPTS[mode],
    "Formatting: GitHub-flavoured markdown. Use $...$ for inline math and $$...$$ for display math (LaTeX). Keep answers focused; prefer short paragraphs.",
    "Accuracy: if you are unsure, say so. Never invent citations, quotes or statistics.",
    "Safety: keep content age-appropriate for school and university learners.",
  ];
  if (classroom) {
    lines.push(`Context: this chat belongs to the class "${classroom.name}"${classroom.subject ? ` (${classroom.subject})` : ""}.`);
  }
  if (materials?.context) {
    lines.push(
      "Class materials are provided below. Prefer them when relevant and cite them inline like [Material: <title>].",
      "If the answer isn't in the materials, say so briefly and then answer from general knowledge.",
      "",
      "=== CLASS MATERIALS ===",
      materials.context,
      "=== END MATERIALS ===",
    );
  }
  if (studySet) {
    lines.push(
      `The learner is studying their own source "${studySet.title}". Answer primarily from it and cite it as [Source].`,
      "",
      "=== SOURCE ===",
      (studySet.sourceText || studySet.summary).slice(0, 150_000),
      "=== END SOURCE ===",
    );
  }
  return lines.join("\n");
}

async function ownConversation(id, user) {
  const convo = await findOr404(prisma.conversation, id, "Conversation");
  if (convo.userId !== user.id) throw forbidden();
  return convo;
}

async function validateLinks(user, { classroomId, studySetId }) {
  if (classroomId) await classAccess(classroomId, user);
  if (studySetId) {
    const set = await findOr404(prisma.studySet, studySetId, "Study set", { select: { userId: true } });
    if (set.userId !== user.id) throw forbidden();
  }
}

const convoSelect = {
  id: true,
  title: true,
  mode: true,
  classroomId: true,
  studySetId: true,
  createdAt: true,
  updatedAt: true,
  classroom: { select: { id: true, name: true, theme: true } },
};

router.get("/conversations", async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { userId: req.user.id },
    select: convoSelect,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  res.json({ conversations });
});

const createSchema = z.object({
  mode: z.enum(MODES).default("explain"),
  classroomId: zObjectId.nullable().optional(),
  studySetId: zObjectId.nullable().optional(),
  title: zOptText(120),
});

router.post("/conversations", async (req, res) => {
  const data = parse(createSchema, req.body);
  await validateLinks(req.user, data);
  const conversation = await prisma.conversation.create({
    data: {
      userId: req.user.id,
      mode: data.mode,
      classroomId: data.classroomId ?? undefined,
      studySetId: data.studySetId ?? undefined,
      title: data.title ?? "New chat",
    },
    select: convoSelect,
  });
  res.status(201).json({ conversation });
});

router.get("/conversations/:id", async (req, res) => {
  await ownConversation(req.params.id, req.user);
  const [conversation, messages] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: req.params.id }, select: convoSelect }),
    prisma.message.findMany({ where: { conversationId: req.params.id }, orderBy: { createdAt: "asc" }, take: 300 }),
  ]);
  let studySet = null;
  if (conversation.studySetId) {
    studySet = await prisma.studySet.findUnique({ where: { id: conversation.studySetId }, select: { id: true, title: true } });
  }
  res.json({ conversation: { ...conversation, studySet }, messages });
});

router.patch("/conversations/:id", async (req, res) => {
  await ownConversation(req.params.id, req.user);
  const data = parse(
    z.object({ title: z.string().trim().min(1).max(120).optional(), mode: z.enum(MODES).optional(), classroomId: zObjectId.nullable().optional() }),
    req.body,
  );
  await validateLinks(req.user, data);
  const conversation = await prisma.conversation.update({ where: { id: req.params.id }, data, select: convoSelect });
  res.json({ conversation });
});

router.delete("/conversations/:id", async (req, res) => {
  await ownConversation(req.params.id, req.user);
  await prisma.conversation.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

async function autoTitle(conversationId, firstMessage) {
  try {
    const { text } = await generateText({
      prompt: `Write a 3-6 word title for a tutoring chat that starts with this message. No quotes, no trailing punctuation.\n\n${firstMessage.slice(0, 1000)}`,
      temperature: 0.3,
      thinking: "off",
      timeoutMs: 20_000,
    });
    const title = text.replace(/^["'#\s]+|["'.\s]+$/g, "").slice(0, 80);
    if (title) await prisma.conversation.update({ where: { id: conversationId }, data: { title } });
  } catch {
    // Keep the heuristic title.
  }
}

router.post("/conversations/:id/messages", chatLimiter, uploader("readable", 3).array("attachments", 3), async (req, res) => {
  assertEnabled();
  const convo = await ownConversation(req.params.id, req.user);
  const { content } = parse(z.object({ content: z.string().trim().max(8000).default("") }), req.body);
  const files = req.files ?? [];
  if (!content && !files.length) throw badRequest("Type a message or attach a photo of the problem.");

  // Build grounding before we start streaming so errors still return proper JSON.
  let classroom = null;
  let materials = null;
  if (convo.classroomId) {
    ({ classroom } = await classAccess(convo.classroomId, req.user));
    materials = await classMaterialsContext(convo.classroomId);
  }
  const studySet = convo.studySetId
    ? await prisma.studySet.findFirst({ where: { id: convo.studySetId, userId: req.user.id }, select: { title: true, summary: true, sourceText: true } })
    : null;

  const history = await prisma.message.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  history.reverse();

  const attachmentParts = [];
  for (const f of files) attachmentParts.push(...(await fileToParts(f.buffer, f.mimetype, f.originalname)));
  const attachments = await saveFiles(files, "tutor");

  const userMessage = await prisma.message.create({
    data: { conversationId: convo.id, role: "user", content, attachments },
  });

  // Merge consecutive same-role turns (e.g. after a failed reply) so roles strictly alternate.
  const contents = [];
  const turns = [
    ...history.map((m) => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.content || (m.attachments.length ? `[attached ${m.attachments.map((a) => a.name).join(", ")}]` : "…") }],
    })),
    { role: "user", parts: [...attachmentParts, { text: content || "Please help me with the attached image." }] },
  ];
  for (const turn of turns) {
    const last = contents[contents.length - 1];
    if (last?.role === turn.role) last.parts.push(...turn.parts);
    else contents.push(turn);
  }
  if (contents[0]?.role === "model") contents.shift();

  // ---- stream ----
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });

  send("meta", { userMessage, sources: materials?.sources ?? [] });

  let full = "";
  try {
    for await (const chunk of streamText({
      system: systemPrompt({ user: req.user, mode: convo.mode, classroom, materials, studySet }),
      contents,
      temperature: convo.mode === "exam" ? 0.4 : 0.7,
      signal: abort.signal,
    })) {
      full += chunk;
      send("delta", { text: chunk });
    }
  } catch (err) {
    clearInterval(heartbeat);
    if (!abort.signal.aborted) {
      send("error", { error: err instanceof HttpError ? err.message : "The tutor hit a problem. Please try again." });
    }
    // Keep a partial answer if the learner already saw some of it.
    if (full.trim()) await prisma.message.create({ data: { conversationId: convo.id, role: "model", content: full } }).catch(() => {});
    return res.end();
  }
  clearInterval(heartbeat);

  const modelMessage = await prisma.message.create({ data: { conversationId: convo.id, role: "model", content: full } });
  const firstExchange = history.length === 0 && convo.title === "New chat";
  await prisma.conversation.update({
    where: { id: convo.id },
    data: firstExchange ? { title: (content || "Photo question").slice(0, 60) } : { updatedAt: new Date() },
  });
  const reward = await awardXp(req.user.id, "tutor", XP.tutorMessage, { tz: req.tz, aggregate: true, dailyCap: XP.tutorDailyCap }).catch(() => null);
  send("done", { message: modelMessage, reward });
  res.end();

  if (firstExchange && content) autoTitle(convo.id, content);
});

export default router;
