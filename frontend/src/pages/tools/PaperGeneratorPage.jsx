import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileQuestion, KeyRound, ListChecks, Plus, Printer, Sparkles, Trash2 } from "lucide-react";
import { api, toForm } from "@/lib/api";
import { plural } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, Switch } from "@/components/ui/misc";
import { AiWorking, AiTag } from "@/components/AiWorking";
import { EMPTY_SOURCE, SourcePicker, sourcePayload, sourceReady } from "@/components/SourcePicker";
import { PaperBalance, PaperView, PrintStyles, SECTION_TYPES, convertibleCount, fmtNum, paperMarkdown } from "./views";
import { DocActions, RecentItems, printWith } from "./kit";

const DEFAULT_SECTIONS = [
  { type: "mcq", count: 10, marksEach: 1 },
  { type: "short", count: 5, marksEach: 3 },
  { type: "long", count: 2, marksEach: 5 },
];

export function useConvertToQuiz() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (artifactId) => api.post(`/tools/question-paper/${artifactId}/to-quiz`),
    onSuccess: ({ quiz }) => navigate(`/app/quizzes/${quiz.id}/edit`),
  });
}

/** Toolbar + paper with an answer-key toggle. Shared with the library view. */
export function PaperResult({ artifact, input }) {
  const [answers, setAnswers] = useState(false);
  const convert = useConvertToQuiz();
  const paper = artifact.data.paper;
  const convertible = convertibleCount(paper);

  return (
    <div className="space-y-4">
      <PrintStyles title={`${artifact.title}${answers ? " — answer key" : ""}`} />
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={answers} onCheckedChange={setAnswers} /> <KeyRound className="size-4 text-muted" /> Show answer key
        </label>
        <DocActions
          title={artifact.title}
          markdown={() => paperMarkdown(paper, { answers, title: artifact.title })}
          onPrint={() => printWith(() => setAnswers(false), () => setAnswers(answers))}
        >
          <Button variant="secondary" size="sm" onClick={() => printWith(() => setAnswers(true), () => setAnswers(answers))}>
            <Printer /> Print key
          </Button>
          {convertible ? (
            <Button size="sm" onClick={() => convert.mutate(artifact.id)} loading={convert.isPending}>
              <ListChecks /> Make it a live quiz
            </Button>
          ) : null}
        </DocActions>
      </div>
      <PaperBalance paper={paper} input={input ?? artifact.data.input} />
      <PaperView paper={paper} answers={answers} title={artifact.title} />
      {convertible ? <p className="no-print text-center text-xs text-muted">{plural(convertible, "question")} can become an auto-graded quiz (long answers stay on paper).</p> : null}
    </div>
  );
}

export default function PaperGeneratorPage() {
  const qc = useQueryClient();
  const [source, setSource] = useState(EMPTY_SOURCE);
  const [details, setDetails] = useState({ subject: "", grade: "", durationMin: 60, difficulty: "mixed", notes: "" });
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const set = (k) => (e) => setDetails((d) => ({ ...d, [k]: e.target.value }));
  const setRow = (i, patch) => setSections((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const totalMarks = sections.reduce((s, r) => s + (Number(r.count) || 0) * (Number(r.marksEach) || 0), 0);
  const totalQuestions = sections.reduce((s, r) => s + (Number(r.count) || 0), 0);

  const generate = useMutation({
    mutationFn: () => {
      const { fields, files } = sourcePayload(source);
      return api.upload(
        "/tools/question-paper",
        toForm(
          {
            ...fields,
            ...details,
            durationMin: Number(details.durationMin),
            sections: sections.map((r) => ({ type: r.type, count: Number(r.count), marksEach: Number(r.marksEach) })),
          },
          files,
        ),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["artifacts"] }),
  });
  const artifact = generate.data?.artifact;
  const valid = sourceReady(source) && sections.length && sections.every((r) => Number(r.count) >= 1 && Number(r.marksEach) > 0);

  return (
    <div>
      <div className="no-print">
        <PageHeader
          eyebrow={<AiTag>Teaching assistant</AiTag>}
          title="Question paper generator"
          description="Exam-ready papers with sections, marks, Bloom's levels and a full marking scheme — from a topic or your own material."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr] print:block">
        <div className="no-print space-y-6">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div>
                <p className="mb-3 text-sm font-semibold">1 · What should it cover?</p>
                <SourcePicker value={source} onChange={setSource} topicLabel="Topics / syllabus" topicPlaceholder="e.g. Cell structure, transport across membranes" />
              </div>
              <div className="space-y-3 border-t border-border pt-5">
                <p className="text-sm font-semibold">2 · Paper details</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Subject" optional>
                    {(p) => <Input {...p} value={details.subject} onChange={set("subject")} placeholder="Biology" />}
                  </Field>
                  <Field label="Grade" optional>
                    {(p) => <Input {...p} value={details.grade} onChange={set("grade")} placeholder="Grade 10" />}
                  </Field>
                  <Field label="Duration (min)">{(p) => <Input {...p} type="number" min={10} max={360} value={details.durationMin} onChange={set("durationMin")} />}</Field>
                  <Field label="Difficulty">
                    {(p) => (
                      <Select {...p} value={details.difficulty} onChange={set("difficulty")}>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                        <option value="mixed">Mixed</option>
                      </Select>
                    )}
                  </Field>
                </div>
              </div>
              <div className="space-y-3 border-t border-border pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">3 · Sections</p>
                  <p className="text-xs tabular-nums text-muted">
                    {plural(totalQuestions, "question")} · {fmtNum(totalMarks)} marks
                  </p>
                </div>
                <ul className="space-y-2">
                  {sections.map((r, i) => (
                    <li key={i} className="grid grid-cols-[1fr_64px_64px_32px] items-end gap-2">
                      <Field label={i === 0 ? "Type" : undefined}>
                        {(p) => (
                          <Select {...p} value={r.type} onChange={(e) => setRow(i, { type: e.target.value })}>
                            {SECTION_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      <Field label={i === 0 ? "Qty" : undefined}>{(p) => <Input {...p} type="number" min={1} max={40} value={r.count} onChange={(e) => setRow(i, { count: e.target.value })} />}</Field>
                      <Field label={i === 0 ? "Marks" : undefined}>{(p) => <Input {...p} type="number" min={0.5} max={50} step="0.5" value={r.marksEach} onChange={(e) => setRow(i, { marksEach: e.target.value })} />}</Field>
                      <Button variant="ghost" size="icon-sm" className="mb-1" onClick={() => setSections((rows) => rows.filter((_, j) => j !== i))} disabled={sections.length === 1} aria-label="Remove section">
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
                {sections.length < 6 ? (
                  <Button variant="ghost" size="sm" onClick={() => setSections((rows) => [...rows, { type: "short", count: 3, marksEach: 2 }])}>
                    <Plus /> Add section
                  </Button>
                ) : null}
                <Field label="Examiner notes" optional>
                  {(p) => <Textarea {...p} rows={2} value={details.notes} onChange={set("notes")} placeholder="Include one diagram-based question; avoid chapter 3…" />}
                </Field>
              </div>
              <Button className="w-full" onClick={() => generate.mutate()} loading={generate.isPending} disabled={!valid}>
                <Sparkles /> {artifact ? "Generate a new paper" : "Generate paper"}
              </Button>
            </CardContent>
          </Card>
          <RecentItems type="question_paper" title="Recent papers" />
        </div>

        <div className="min-w-0">
          {generate.isPending ? (
            <AiWorking title="Setting your paper…" steps={["Reading the syllabus", "Balancing Bloom's levels", "Writing questions", "Preparing the marking scheme"]} />
          ) : artifact ? (
            <>
              <div className="no-print mb-3 flex justify-end">
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/app/library/${artifact.id}`}>
                    <ExternalLink /> Open in library
                  </Link>
                </Button>
              </div>
              <PaperResult artifact={artifact} />
            </>
          ) : (
            <EmptyState icon={FileQuestion} title="Your paper will appear here" description="Pick a source and set up the sections on the left. You'll get a printable paper and an answer key, and objective questions can become a live, auto-graded quiz." />
          )}
        </div>
      </div>
    </div>
  );
}
