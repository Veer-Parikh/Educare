import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { BookOpenText, Check, Presentation } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthLayout } from "./AuthLayout";

const ROLES = [
  { value: "STUDENT", label: "I'm a student", icon: BookOpenText, text: "Join classes, study with AI" },
  { value: "TEACHER", label: "I'm a teacher", icon: Presentation, text: "Run classes, grade faster" },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    role: params.get("role") === "teacher" ? "TEACHER" : "STUDENT",
    name: "",
    email: "",
    password: "",
    sapId: "",
    institution: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register(form);
      navigate(params.get("code") ? `/app/classes?join=${encodeURIComponent(params.get("code"))}` : "/app", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes less than a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-fg underline decoration-brand-500 decoration-2 underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
          {ROLES.map(({ value, label, icon: Icon, text }) => {
            const active = form.role === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setForm((f) => ({ ...f, role: value }))}
                className={cn(
                  "relative rounded-xl border p-3 text-left transition",
                  active ? "border-brand-500 bg-brand-50 ring-3 ring-brand-500/15 dark:bg-brand-500/10" : "border-border bg-surface hover:border-border-strong",
                )}
              >
                {active ? (
                  <span className="absolute right-2.5 top-2.5 grid size-4 place-items-center rounded-full bg-brand-500 text-[#16140f]">
                    <Check className="size-3" />
                  </span>
                ) : null}
                <Icon className="size-5" />
                <p className="mt-2 text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted">{text}</p>
              </button>
            );
          })}
        </div>

        <Field label="Full name">{(p) => <Input {...p} autoFocus autoComplete="name" value={form.name} onChange={set("name")} placeholder="Aarav Shah" />}</Field>
        <Field label="Email">{(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@school.edu" />}</Field>
        <Field label="Password" hint="At least 8 characters.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SAP ID" optional hint="Lets you sign in with it.">
            {(p) => <Input {...p} value={form.sapId} onChange={set("sapId")} inputMode="numeric" placeholder="60012345" />}
          </Field>
          <Field label="School" optional>
            {(p) => <Input {...p} value={form.institution} onChange={set("institution")} autoComplete="organization" />}
          </Field>
        </div>

        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!form.name || !form.email || form.password.length < 8}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
