// Helpers shared by the Study Studio pages.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { BookOpen, ClipboardPaste, FileText, Image, Lightbulb } from "lucide-react";
import { api } from "@/lib/api";

const TONES = {
  topic: "bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300",
  text: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  material: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  file: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  image: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

const IMAGE_RE = /\.(png|jpe?g|webp|heic|heif|gif)$/i;

/** Icon, label and colour for a study set's source. */
export function sourceMeta(type, name) {
  switch (type) {
    case "topic":
      return { icon: Lightbulb, kind: "Topic", tone: TONES.topic };
    case "text":
      return { icon: ClipboardPaste, kind: "Pasted notes", tone: TONES.text };
    case "material":
      return { icon: BookOpen, kind: "Class material", tone: TONES.material };
    case "file":
      if (name && IMAGE_RE.test(name)) return { icon: Image, kind: "Photo", tone: TONES.image };
      if (name && /\.pdf$/i.test(name)) return { icon: FileText, kind: "PDF", tone: TONES.file };
      return { icon: FileText, kind: "Document", tone: TONES.file };
    default:
      return { icon: FileText, kind: "Source", tone: TONES.file };
  }
}

/** Human description of where a pack came from, e.g. "Topic · Photosynthesis". */
export function sourceLabel(set) {
  const { kind } = sourceMeta(set.sourceType, set.sourceName);
  if (!set.sourceName) return kind;
  return set.sourceType === "topic" ? `Topic · ${set.sourceName}` : set.sourceName;
}

/** Rough reading time for a block of Markdown. */
export function readingMinutes(text = "") {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** The whole study pack as a portable Markdown document. */
export function packToMarkdown(set) {
  const out = [`# ${set.title}`, ""];
  if (set.summary) out.push("## Summary", "", set.summary.trim(), "");
  if (set.keyPoints?.length) out.push("## Key points", "", ...set.keyPoints.map((p, i) => `${i + 1}. ${p}`), "");
  if (set.concepts?.length) out.push("## Glossary", "", ...set.concepts.map((c) => `- **${c.term}** — ${c.definition}`), "");
  if (set.questionsToPonder?.length) out.push("## Questions to ponder", "", ...set.questionsToPonder.map((q) => `- ${q}`), "");
  return `${out.join("\n").trim()}\n`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable (insecure origin, old browser) — fall back to a hidden textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/**
 * Start a tutor conversation grounded in a study set and jump to it.
 * `start({ key, prompt?, mode? })` — `key` identifies which button is busy.
 */
export function useStudyChat(set) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async ({ prompt, mode = "explain" }) => {
      const { conversation } = await api.post("/tutor/conversations", {
        mode,
        studySetId: set.id,
        title: `Chat: ${set.title}`.slice(0, 120),
      });
      return { conversation, prompt };
    },
    onSuccess: ({ conversation, prompt }) => {
      qc.invalidateQueries({ queryKey: ["tutor", "conversations"] });
      navigate(`/app/tutor/${conversation.id}${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ""}`);
    },
  });
  return {
    start: (vars) => !m.isPending && m.mutate(vars),
    pending: m.isPending,
    busyKey: m.isPending ? m.variables?.key : null,
  };
}

export const SIMPLE_PROMPT = "Explain the key ideas of this source simply, like I'm new to it.";

export const discussPrompt = (question) =>
  `Help me think through this question from my study pack: "${question}"\n\nDon't give me the answer straight away — guide me with hints and questions.`;
