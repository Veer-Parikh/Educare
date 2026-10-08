import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Eye, EyeOff, GraduationCap, Presentation } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthLayout } from "./AuthLayout";

// Accounts created by `npm run seed` (and pre-loaded by `npm run demo`).
const DEMO_PASSWORD = "educare123";
const DEMO_ACCOUNTS = [
  { key: "teacher", label: "Teacher", email: "teacher@educare.dev", icon: Presentation },
  { key: "student", label: "Student", email: "aarav@educare.dev", icon: GraduationCap },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // "form" | demo account key

  const signIn = async (source, id, pw) => {
    setError("");
    setBusy(source);
    try {
      await login(id, pw);
      const next = params.get("next");
      navigate(next && next.startsWith("/app") ? next : "/app", { replace: true });
    } catch (err) {
      setError(source !== "form" && err.status === 401 ? "Demo accounts aren't set up on this server yet. Run npm run seed in the backend." : err.message);
    } finally {
      setBusy(null);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    signIn("form", identifier.trim(), password);
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in with your email or SAP ID."
      footer={
        <>
          New to EduCare?{" "}
          <Link to="/register" className="font-medium text-fg underline decoration-brand-500 decoration-2 underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email or SAP ID">
          {(p) => <Input {...p} autoFocus autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@school.edu or 60012345" required />}
        </Field>
        <Field label="Password">
          {(p) => (
            <div className="relative">
              <Input {...p} type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-faint hover:text-fg" aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>
        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" loading={busy === "form"} disabled={!identifier || !password || Boolean(busy)}>
          Sign in
        </Button>
      </form>

      <div className="mt-8">
        <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-faint">
          <span className="h-px flex-1 bg-border" />
          Or try a demo account
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {DEMO_ACCOUNTS.map(({ key, label, email, icon: Icon }) => (
            <Button key={key} type="button" variant="secondary" size="lg" loading={busy === key} disabled={Boolean(busy)} onClick={() => signIn(key, email, DEMO_PASSWORD)}>
              {busy === key ? null : <Icon />}
              {label}
            </Button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
