import { CalendarClock, FileText, Paperclip, Star } from "lucide-react";
import { dueLabel, plural } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FileChip } from "@/components/ui/file-drop";
import { Markdown } from "@/components/Markdown";
import { ClassChip } from "@/components/ClassChip";

export function AssignmentMeta({ assignment }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
      <ClassChip classroom={assignment.classroom} className="text-sm" />
      <span className="inline-flex items-center gap-1.5">
        <CalendarClock className="size-4" /> {assignment.dueAt ? `Due ${dueLabel(assignment.dueAt)}` : "No due date"}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Star className="size-4" /> {plural(assignment.points, "point")}
      </span>
    </div>
  );
}

export function InstructionsCard({ assignment }) {
  return (
    <Card>
      <CardHeader icon={FileText} title="Instructions" description={assignment.author ? `Posted by ${assignment.author.name}` : undefined} />
      <CardContent>
        {assignment.instructions ? <Markdown>{assignment.instructions}</Markdown> : <p className="text-sm text-muted">No written instructions.</p>}
        {assignment.attachments.length ? (
          <div className="mt-5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-faint">
              <Paperclip className="size-3.5" /> Attachments
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {assignment.attachments.map((f) => (
                <FileChip key={f.key ?? f.url} name={f.name} size={f.size} mime={f.mimeType} url={f.url} />
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Rubric table; pass `scores` (criterionId → {score, comment}) to show results. */
export function RubricCard({ rubric, scores }) {
  if (!rubric?.length) return null;
  return (
    <Card>
      <CardHeader icon={Star} title="Rubric" description="How this work is assessed" />
      <CardContent className="pt-3">
        <ul className="divide-y divide-border">
          {rubric.map((r) => {
            const s = scores?.[r.id];
            return (
              <li key={r.id} className="flex items-start gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.title}</p>
                  {r.description ? <p className="mt-0.5 text-sm text-muted">{r.description}</p> : null}
                  {s?.comment ? <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm">{s.comment}</p> : null}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {s ? (
                    <>
                      {s.score}
                      <span className="font-normal text-muted">/{r.points}</span>
                    </>
                  ) : (
                    <span className="text-muted">{r.points} pts</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export const scoreMap = (rubricScores = []) => Object.fromEntries(rubricScores.map((r) => [r.criterionId, r]));
