import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, ExternalLink, FileText, RotateCcw, ScanLine, ShieldCheck, Sparkles, Type } from "lucide-react";
import { api, toForm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, Segmented } from "@/components/ui/misc";
import { FileDrop } from "@/components/ui/file-drop";
import { AiWorking, AiTag } from "@/components/AiWorking";
import { AnswerCheckView, PrintStyles, answerCheckMarkdown } from "./views";
import { DocActions, RecentItems } from "./kit";

const KEY_ACCEPT = ".pdf,.docx,.txt,.md,image/png,image/jpeg,image/webp,image/heic";
const SHEET_ACCEPT = ".pdf,image/png,image/jpeg,image/webp,image/heic";

export default function AnswerCheckerPage() {
  const qc = useQueryClient();
  const { isTeacher } = useAuth();
  const [keyMode, setKeyMode] = useState("text");
  const [keyText, setKeyText] = useState("");
  const [keyFile, setKeyFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [opts, setOpts] = useState({ defaultMarks: 5, strictness: "balanced", title: "" });

  const check = useMutation({
    mutationFn: () =>
      api.upload(
        "/tools/answer-check",
        toForm(
          { answerKeyText: keyMode === "text" ? keyText : undefined, defaultMarks: Number(opts.defaultMarks) || 5, strictness: opts.strictness, title: opts.title || undefined },
          { answerKey: keyMode === "file" && keyFile ? [keyFile] : [], answerSheet: sheets },
        ),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["artifacts"] }),
  });
  const artifact = check.data?.artifact;
  const hasKey = keyMode === "text" ? keyText.trim().length >= 10 : Boolean(keyFile);
  const reset = () => {
    check.reset();
    setSheets([]);
    setOpts((o) => ({ ...o, title: "" }));
  };

  return (
    <div>
      <div className="no-print">
        <PageHeader
          eyebrow={<AiTag>Vision AI</AiTag>}
          title="Answer sheet checker"
          description={isTeacher ? "Photograph a handwritten answer sheet, add the answer key, and get per-question marks with feedback. You stay the final judge." : "Check your practice answers against the answer key before the real exam — handwriting works."}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr] print:block">
        <div className="no-print space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">1 · Answer key</p>
                  <Segmented
                    size="sm"
                    value={keyMode}
                    onChange={setKeyMode}
                    options={[
                      { value: "text", label: "Type", icon: Type },
                      { value: "file", label: "Upload", icon: FileText },
                    ]}
                  />
                </div>
                {keyMode === "text" ? (
                  <Textarea
                    rows={6}
                    value={keyText}
                    onChange={(e) => setKeyText(e.target.value)}
                    placeholder={"Q1 (2 marks): Chloroplast\nQ2 (3 marks): Light reactions make ATP, NADPH and O₂ in the thylakoids…"}
                    aria-label="Answer key"
                  />
                ) : (
                  <FileDrop compact multiple={false} files={keyFile ? [keyFile] : []} onChange={(f) => setKeyFile(f[0] ?? null)} accept={KEY_ACCEPT} hint="PDF, DOCX, text or a photo of the key" />
                )}
                <p className="text-xs text-muted">Include marks per question if you can; otherwise each question is worth the default below.</p>
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <p className="text-sm font-semibold">2 · Student's answer sheet</p>
                <FileDrop files={sheets} onChange={setSheets} max={6} accept={SHEET_ACCEPT} capture="environment" label="Add photos or a PDF" hint="Up to 6 pages · on a phone this opens the camera" />
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <p className="text-sm font-semibold">3 · Grading</p>
                <Segmented
                  value={opts.strictness}
                  onChange={(strictness) => setOpts((o) => ({ ...o, strictness }))}
                  options={[
                    { value: "lenient", label: "Lenient" },
                    { value: "balanced", label: "Balanced" },
                    { value: "strict", label: "Strict" },
                  ]}
                  className="flex w-full"
                />
                <div className="grid grid-cols-[110px_1fr] gap-3">
                  <Field label="Default marks">{(p) => <Input {...p} type="number" min={0.5} max={100} step="0.5" value={opts.defaultMarks} onChange={(e) => setOpts((o) => ({ ...o, defaultMarks: e.target.value }))} />}</Field>
                  <Field label="Label" optional>
                    {(p) => <Input {...p} value={opts.title} onChange={(e) => setOpts((o) => ({ ...o, title: e.target.value }))} placeholder="e.g. Unit test — Riya" />}
                  </Field>
                </div>
              </div>

              <Button className="w-full" onClick={() => check.mutate()} loading={check.isPending} disabled={!hasKey || !sheets.length}>
                <ScanLine /> Check answers
              </Button>
              <p className="flex items-start gap-2 text-xs text-muted">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> Uploaded sheets are sent to the AI for reading and aren't stored with the result.
              </p>
            </CardContent>
          </Card>
          <RecentItems type="answer_check" title="Recent checks" />
        </div>

        <div className="min-w-0">
          {check.isPending ? (
            <AiWorking title="Reading the answer sheet…" steps={["Transcribing handwriting", "Matching answers to questions", "Marking against the key", "Writing feedback"]} />
          ) : artifact ? (
            <div className="space-y-4">
              <PrintStyles title={artifact.title} />
              <div className="no-print flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={reset}>
                  <RotateCcw /> Check another sheet
                </Button>
                <DocActions title={artifact.title} markdown={() => answerCheckMarkdown(artifact.data.result, { title: artifact.title })}>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/app/library/${artifact.id}`}>
                      <ExternalLink /> Open
                    </Link>
                  </Button>
                </DocActions>
              </div>
              <AnswerCheckView result={artifact.data.result} input={artifact.data.input} title={artifact.title} createdAt={artifact.createdAt} />
            </div>
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="Results will appear here"
              description="Each question gets a verdict, marks, the expected key points next to what was written, and specific feedback — plus strengths and what to revise."
              action={
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <Sparkles className="size-3.5" /> AI reads handwriting, diagrams and scanned PDFs
                </span>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
