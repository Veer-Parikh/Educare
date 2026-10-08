import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, KeyRound, LogOut, Monitor, Moon, Palette, Sun, Target, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api, toForm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const GOALS = [
  { value: 30, label: "Casual", hint: "~10 min a day" },
  { value: 60, label: "Regular", hint: "~20 min a day" },
  { value: 120, label: "Serious", hint: "~40 min a day" },
  { value: 200, label: "Intense", hint: "An hour or more" },
];

function ProfileCard() {
  const { user, setUser } = useAuth();
  const fileRef = useRef(null);
  const [form, setForm] = useState({ name: "", bio: "", sapId: "", institution: "" });
  useEffect(() => {
    if (user) setForm({ name: user.name ?? "", bio: user.bio ?? "", sapId: user.sapId ?? "", institution: user.institution ?? "" });
  }, [user]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const dirty = user && ["name", "bio", "sapId", "institution"].some((k) => (user[k] ?? "") !== form[k]);

  const save = useMutation({
    mutationFn: () => api.patch("/users/me", form),
    onSuccess: ({ user: u }) => {
      setUser(u);
      toast.success("Profile saved");
    },
  });
  const avatar = useMutation({
    mutationFn: (file) => api.upload("/users/me/avatar", toForm({}, { avatar: file })),
    onSuccess: ({ user: u }) => {
      setUser(u);
      toast.success("Photo updated");
    },
  });

  return (
    <Card id="profile">
      <CardHeader icon={UserRound} title="Profile" description="How you appear to classmates and teachers" />
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar name={user?.name} src={user?.avatarUrl} size="xl" />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border border-border bg-surface shadow-soft transition hover:bg-subtle"
              aria-label="Change photo"
              disabled={avatar.isPending}
            >
              <Camera className="size-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) avatar.mutate(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{user?.name}</p>
            <p className="truncate text-sm text-muted">{user?.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge tone={user?.role === "TEACHER" ? "violet" : "brand"}>{user?.role === "TEACHER" ? "Teacher" : "Student"}</Badge>
              <Badge>Joined {shortDate(user?.createdAt)}</Badge>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">{(p) => <Input {...p} value={form.name} onChange={set("name")} />}</Field>
          <Field label="SAP ID" optional hint="You can sign in with it.">
            {(p) => <Input {...p} value={form.sapId} onChange={set("sapId")} />}
          </Field>
          <Field label="School / institution" optional className="sm:col-span-2">
            {(p) => <Input {...p} value={form.institution} onChange={set("institution")} />}
          </Field>
          <Field label="Bio" optional className="sm:col-span-2">
            {(p) => <Textarea {...p} rows={3} value={form.bio} onChange={set("bio")} maxLength={500} placeholder={user?.role === "TEACHER" ? "Subjects you teach, office hours…" : "What you're studying, goals…"} />}
          </Field>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty || form.name.trim().length < 2}>
          Save profile
        </Button>
      </CardFooter>
    </Card>
  );
}

function PreferencesCard() {
  const { user, setUser, isStudent } = useAuth();
  const { theme, setTheme } = useTheme();
  const goal = useMutation({
    mutationFn: (dailyGoalXp) => api.patch("/users/me", { dailyGoalXp }),
    onSuccess: ({ user: u }) => {
      setUser(u);
      toast.success("Daily goal updated");
    },
  });

  return (
    <Card id="preferences">
      <CardHeader icon={Palette} title="Preferences" />
      <CardContent className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium">Theme</p>
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            {[
              ["light", Sun, "Light"],
              ["dark", Moon, "Dark"],
              ["system", Monitor, "System"],
            ].map(([value, Icon, label]) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn("flex flex-col items-center gap-2 rounded-xl border p-3 text-sm font-medium transition", theme === value ? "border-brand-500 bg-brand-50 ring-3 ring-brand-500/15 dark:bg-brand-500/10" : "border-border hover:border-border-strong")}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
        </div>
        {isStudent ? (
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Target className="size-4" /> Daily XP goal
            </p>
            <p className="mt-0.5 text-xs text-muted">Hitting it every day builds your streak. Pick something you can sustain.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => goal.mutate(g.value)}
                  disabled={goal.isPending}
                  className={cn("rounded-xl border p-3 text-left transition", user?.dailyGoalXp === g.value ? "border-brand-500 bg-brand-50 ring-3 ring-brand-500/15 dark:bg-brand-500/10" : "border-border hover:border-border-strong")}
                >
                  <p className="text-sm font-semibold">{g.label}</p>
                  <p className="text-xs text-muted">
                    {g.value} XP · {g.hint}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const change = useMutation({
    mutationFn: () => api.post("/auth/change-password", { currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      toast.success("Password changed");
    },
  });
  const mismatch = form.confirm && form.confirm !== form.newPassword;
  return (
    <Card>
      <CardHeader icon={KeyRound} title="Password" />
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} />}</Field>
        <Field label="New password" hint="8+ characters">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} />}
        </Field>
        <Field label="Confirm" error={mismatch ? "Passwords don't match" : undefined}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} />}
        </Field>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={() => change.mutate()} loading={change.isPending} disabled={!form.currentPassword || form.newPassword.length < 8 || mismatch}>
          Change password
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function SettingsPage() {
  const { logout } = useAuth();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Your profile, preferences and account."
        actions={
          <Button variant="secondary" onClick={logout}>
            <LogOut /> Sign out
          </Button>
        }
      />
      <div className="space-y-6">
        <ProfileCard />
        <PreferencesCard />
        <PasswordCard />
      </div>
    </div>
  );
}
