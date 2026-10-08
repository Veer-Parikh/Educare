// Port of backend/src/modules/tutor.js.
import { awardXp, badRequest, by, classAccess, db, fileRef, findOr404, forbidden, insert, isObjectId, remove, sleep, update, XP } from "../core.js";
import { route, sse } from "../router.js";
import { chunks, think, topicInfo, tutorReply } from "../ai.js";

export const MODES = ["explain", "socratic", "exam"];
const HISTORY_LIMIT = 24;

// ---- validation (mirrors the zod schemas) ------------------------------------

const fail = (path, message) => badRequest(`${path}: ${message}`, [{ path, message }]);

function modeField(v, path = "mode") {
  if (!MODES.includes(v)) throw fail(path, `Invalid option: expected one of ${MODES.map((m) => `"${m}"`).join("|")}`);
  return v;
}

function idField(v, path) {
  if (v === undefined || v === null) return v;
  if (!isObjectId(v)) throw fail(path, "Invalid id");
  return v;
}

// ---- helpers -------------------------------------------------------------------

function ownConversation(id, user) {
  const convo = findOr404("conversations", id, "Conversation");
  if (convo.userId !== user.id) throw forbidden();
  return convo;
}

function validateLinks(user, { classroomId, studySetId }) {
  if (classroomId) classAccess(classroomId, user);
  if (studySetId) {
    const set = findOr404("studySets", studySetId, "Study set");
    if (set.userId !== user.id) throw forbidden();
  }
}

/** backend convoSelect */
function presentConvo(c) {
  const classroom = c.classroomId ? db.classrooms.find((k) => k.id === c.classroomId) : null;
  return {
    id: c.id,
    title: c.title,
    mode: c.mode,
    classroomId: c.classroomId ?? null,
    studySetId: c.studySetId ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    classroom: classroom ? { id: classroom.id, name: classroom.name, theme: classroom.theme } : null,
  };
}

/** backend classMaterialsContext: the class's readable materials, newest first. */
function classMaterials(classroomId) {
  return db.materials
    .filter((m) => m.classroomId === classroomId && m.textStatus === "ready")
    .sort(by("createdAt", "desc"))
    .slice(0, 25);
}

/** Stand-in for the model-written 3-6 word chat title. */
export function chatTitle(text) {
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/^(hi|hello|hey)[,!.\s]+/i, "");
  t = t.replace(
    /^(can you|could you|would you|please|help me( to)?( understand)?|i need help with|i'm stuck on|i am stuck on|explain( to me)?|what is|what's|what are|how do i|how do you|how does|how do|why does|why do|why is|tell me about|walk me through|quiz me on)\s+/i,
    "",
  );
  t = t.replace(/^(the|a|an)\s+/i, "");
  const words = t.split(" ").slice(0, 6).join(" ").replace(/[?.!,:;'"]+$/g, "");
  if (words.split(" ").length < 2) return null;
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 80);
}

// ---- conversations -------------------------------------------------------------

route("GET", "/tutor/conversations", (req) => {
  const conversations = db.conversations
    .filter((c) => c.userId === req.user.id)
    .sort(by("updatedAt", "desc"))
    .slice(0, 100)
    .map(presentConvo);
  return { conversations };
});

route("POST", "/tutor/conversations", (req) => {
  const b = req.body ?? {};
  const mode = b.mode === undefined ? "explain" : modeField(b.mode);
  const classroomId = idField(b.classroomId, "classroomId");
  const studySetId = idField(b.studySetId, "studySetId");
  let title;
  if (b.title !== undefined && b.title !== null) {
    if (typeof b.title !== "string") throw fail("title", "Invalid input: expected string");
    title = b.title.trim() || undefined;
    if (title && title.length > 120) throw fail("title", "Too big: expected string to have <=120 characters");
  }
  validateLinks(req.user, { classroomId, studySetId });
  const conversation = insert("conversations", {
    userId: req.user.id,
    mode,
    classroomId: classroomId ?? null,
    studySetId: studySetId ?? null,
    title: title ?? "New chat",
  });
  return { conversation: presentConvo(conversation) };
});

route("GET", "/tutor/conversations/:id", (req) => {
  const convo = ownConversation(req.params.id, req.user);
  const messages = db.messages
    .filter((m) => m.conversationId === convo.id)
    .sort(by("createdAt"))
    .slice(0, 300);
  let studySet = null;
  if (convo.studySetId) {
    const set = db.studySets.find((s) => s.id === convo.studySetId);
    studySet = set ? { id: set.id, title: set.title } : null;
  }
  return { conversation: { ...presentConvo(convo), studySet }, messages };
});

route("PATCH", "/tutor/conversations/:id", (req) => {
  const convo = ownConversation(req.params.id, req.user);
  const b = req.body ?? {};
  const data = {};
  if (b.title !== undefined) {
    const title = typeof b.title === "string" ? b.title.trim() : null;
    if (!title) throw fail("title", "Too small: expected string to have >=1 characters");
    if (title.length > 120) throw fail("title", "Too big: expected string to have <=120 characters");
    data.title = title;
  }
  if (b.mode !== undefined) data.mode = modeField(b.mode);
  if (b.classroomId !== undefined) data.classroomId = idField(b.classroomId, "classroomId");
  validateLinks(req.user, data);
  update("conversations", convo, data);
  return { conversation: presentConvo(convo) };
});

route("DELETE", "/tutor/conversations/:id", (req) => {
  const convo = ownConversation(req.params.id, req.user);
  remove("messages", (m) => m.conversationId === convo.id);
  remove("conversations", (c) => c.id === convo.id);
  return { ok: true };
});

// ---- messages (server-sent events) ----------------------------------------------

const FORMULA = {
  Physics: "$$v^2 = u^2 + 2as \\qquad s = ut + \\tfrac{1}{2}at^2$$",
  Chemistry: "$$n = \\frac{m}{M} \\qquad \\text{particles} = n \\times 6.022 \\times 10^{23}$$",
  Biology: "$$6\\,\\text{CO}_2 + 6\\,\\text{H}_2\\text{O} \\xrightarrow{\\text{light}} \\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\,\\text{O}_2$$",
  Mathematics: "$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
};

const answerOf = (q) => (q.type === "mcq" ? q.correct : q.type === "truefalse" ? (q.answer ? "True" : "False") : q.answerText);

/**
 * Later turns of a conversation. ai.tutorReply always opens a topic from scratch,
 * so follow-ups rotate through other concepts and practice questions instead.
 */
function followUpReply({ mode, message, context, turn, cite }) {
  const topic = topicInfo(`${message} ${context}`.slice(0, 6000));
  const cs = topic.concepts;
  const qs = topic.questions;
  const c = cs[(turn + 2) % cs.length];
  const c2 = cs[(turn + 3) % cs.length];
  const q = qs[(turn * 2 + 1) % qs.length];
  const q2 = qs[(turn * 2 + 4) % qs.length];
  const attempt = /\b(because|so|i think|maybe|is it|it's|it is|would|=)\b/i.test(message);

  if (mode === "socratic") {
    return [
      attempt ? "You're on the right track — that's exactly the kind of reasoning we want." : "Let's slow down and take it one step at a time.",
      "",
      `Here's the next thing to think about: **${q.prompt}**`,
      "",
      `It might help to recall *${c.term.toLowerCase()}*.${cite}`,
      "",
      `> Hint: ${c.definition}`,
      "",
      "What's your answer — and, more importantly, *why*? Reply with your reasoning and I'll tell you whether it holds up.",
    ].join("\n");
  }

  if (mode === "exam") {
    return [
      `**Exam drill — round ${turn + 1}**`,
      "",
      `1. ${q.prompt}`,
      `2. ${q2.prompt}`,
      "",
      "---",
      "",
      `**Answers:** (1) ${answerOf(q)} — ${q.explanation} (2) ${answerOf(q2)} — ${q2.explanation}`,
      "",
      `**Examiner tip:** questions on *${c.term.toLowerCase()}* often hide the key word in the stem — underline it before you answer.${cite}`,
      "",
      "Want another round, or shall we switch topics?",
    ].join("\n");
  }

  return [
    attempt ? "Good thinking — let's check it and take it a step further." : "Good follow-up. Let's look at it from another angle.",
    "",
    `**${c.term}.** ${c.definition}${cite}`,
    "",
    `This connects to **${c2.term.toLowerCase()}**: ${lowerFirst(c2.definition)}`,
    "",
    FORMULA[topic.subject] ?? "",
    "",
    `**Worked example:** ${q.prompt}`,
    "",
    `→ **${answerOf(q)}.** ${q.explanation}`,
    "",
    `**Your turn:** ${q2.prompt}`,
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n");
}

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

function attachmentReply(files, mode) {
  const names = files.map((f) => `**${f.name || "attachment"}**`).join(", ");
  const lines = [
    `Thanks — I've got ${names}.`,
    ``,
    `_Demo mode can't read photos or PDFs, so I can't see what's on it._ Type the question (or the step you're stuck on) and I'll ${mode === "socratic" ? "guide you through it with hints" : mode === "exam" ? "give you the high-yield points and a practice question" : "walk you through it step by step"}.`,
    ``,
    `**Tip:** when you share a problem, include what you've already tried — e.g. "I used $v = u + at$ but got a negative time." That helps me spot exactly where it went wrong.`,
  ];
  return lines.join("\n");
}

sse("POST", "/tutor/conversations/:id/messages", async (req, emit) => {
  const convo = ownConversation(req.params.id, req.user);
  const raw = req.body?.content ?? "";
  if (typeof raw !== "string") throw fail("content", "Invalid input: expected string");
  const content = raw.trim();
  if (content.length > 8000) throw fail("content", "Too big: expected string to have <=8000 characters");
  const files = (req.files?.attachments ?? []).slice(0, 3);
  if (!content && !files.length) throw badRequest("Type a message or attach a photo of the problem.");

  // Grounding, built before streaming so errors still surface as normal failures.
  let classroom = null;
  let materials = [];
  if (convo.classroomId) {
    ({ classroom } = classAccess(convo.classroomId, req.user));
    materials = classMaterials(convo.classroomId);
  }
  const studySetRow = convo.studySetId ? db.studySets.find((s) => s.id === convo.studySetId && s.userId === req.user.id) : null;
  const studySet = studySetRow ? { title: studySetRow.title, summary: studySetRow.summary, sourceText: studySetRow.sourceText } : null;

  const history = db.messages.filter((m) => m.conversationId === convo.id).sort(by("createdAt", "desc")).slice(0, HISTORY_LIMIT);

  const attachments = [];
  for (const f of files) attachments.push(await fileRef(f));
  const userMessage = insert("messages", { conversationId: convo.id, role: "user", content, attachments });

  emit("meta", { userMessage, sources: materials.map((m) => ({ id: m.id, title: m.title })) });

  const turn = history.filter((m) => m.role === "model").length;
  const cite = studySet ? " [Source]" : materials[0] ? ` [Material: ${materials[0].title}]` : "";
  // Topic detection is keyword-based, so keep the grounding it sees short and focused.
  const hint = studySet ? { title: studySet.title, summary: studySet.summary.slice(0, 300) } : null;
  const hintMaterials = materials.map((m) => ({ title: m.title, text: m.text?.slice(0, 600) ?? "" }));
  const context = [
    ...history.filter((m) => m.role === "user").map((m) => m.content),
    hint ? `${hint.title} ${hint.summary}` : "",
    ...hintMaterials.map((m) => `${m.title} ${m.text}`),
  ].join(" ");
  const reply =
    !content && files.length
      ? attachmentReply(files, convo.mode)
      : turn === 0 || /^(hi|hello|hey)\b/i.test(content)
        ? tutorReply({ mode: convo.mode, message: content, materials: hintMaterials, studySet: hint, userName: req.user.name })
        : followUpReply({ mode: convo.mode, message: content, context, turn, cite });

  await think(500, 1000);
  let full = "";
  for (const piece of chunks(reply)) {
    if (req.signal?.aborted) break;
    full += piece;
    emit("delta", { text: piece });
    await sleep(22 + Math.random() * 45);
  }

  if (req.signal?.aborted) {
    // Keep a partial answer if the learner already saw some of it.
    if (full.trim()) insert("messages", { conversationId: convo.id, role: "model", content: full });
    return;
  }

  const modelMessage = insert("messages", { conversationId: convo.id, role: "model", content: full });
  const firstExchange = history.length === 0 && convo.title === "New chat";
  update("conversations", convo, firstExchange ? { title: (content || "Photo question").slice(0, 60) } : {});
  const reward = awardXp(req.user.id, "tutor", XP.tutorMessage, { tz: req.tz, aggregate: true, dailyCap: XP.tutorDailyCap });
  emit("done", { message: modelMessage, reward });

  // The backend asks the model for a short title after the reply; do the same heuristically.
  if (firstExchange && content) {
    const title = chatTitle(content);
    if (title) update("conversations", convo, { title });
  }
});
