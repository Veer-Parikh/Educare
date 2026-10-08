import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  LogOut,
  Megaphone,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Table2,
  Trash2,
  Trophy,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { classTheme, cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tip } from "@/components/ui/menu";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";
import { ClassFormDialog } from "./ClassesPage";
import StreamTab from "./tabs/StreamTab";
import ClassworkTab from "./tabs/ClassworkTab";
import MaterialsTab from "./tabs/MaterialsTab";
import PeopleTab from "./tabs/PeopleTab";
import LiveTab from "./tabs/LiveTab";
import LeaderboardTab from "./tabs/LeaderboardTab";
import InsightsTab from "./tabs/InsightsTab";
import GradesTab from "./tabs/GradesTab";

const TABS = [
  { id: "", label: "Stream", icon: Megaphone, component: StreamTab },
  { id: "classwork", label: "Classwork", icon: ClipboardList, component: ClassworkTab },
  { id: "materials", label: "Materials", icon: BookOpen, component: MaterialsTab },
  { id: "live", label: "Live", icon: Video, component: LiveTab },
  { id: "people", label: "People", icon: Users, component: PeopleTab },
  { id: "leaderboard", label: "Leaderboard", icon: Trophy, component: LeaderboardTab },
  { id: "grades", label: "Grades", icon: Table2, component: GradesTab },
  { id: "insights", label: "Insights", icon: BarChart3, component: InsightsTab, teacher: true },
];

function CodeButton({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tip content="Copy class code">
      <button
        onClick={() => {
          navigator.clipboard?.writeText(code);
          setCopied(true);
          toast.success("Class code copied");
          setTimeout(() => setCopied(false), 1500);
        }}
        className="inline-flex items-center gap-2 rounded-xl bg-white/85 px-3 py-1.5 font-mono text-sm font-semibold tracking-widest text-[#16140f] shadow-sm backdrop-blur transition hover:bg-white"
      >
        {code}
        {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5 opacity-60" />}
      </button>
    </Tip>
  );
}

export default function ClassPage() {
  const { classId, tab = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const activeTabRef = useRef(null);

  // Keep the active tab visible in the horizontally scrolling strip (phones).
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab]);

  const { data, isLoading, error } = useQuery({ queryKey: ["class", classId], queryFn: () => api.get(`/classes/${classId}`) });
  const classroom = data?.classroom;
  const isTeacher = data?.isTeacher;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["class", classId] });
    qc.invalidateQueries({ queryKey: ["classes"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const regenerate = useMutation({ mutationFn: () => api.post(`/classes/${classId}/code`), onSuccess: () => { invalidate(); toast.success("New class code generated"); } });
  const archive = useMutation({ mutationFn: (archived) => api.patch(`/classes/${classId}`, { archived }), onSuccess: (_, archived) => { invalidate(); toast.success(archived ? "Class archived" : "Class restored"); } });
  const remove = useMutation({ mutationFn: () => api.del(`/classes/${classId}`), onSuccess: () => { invalidate(); toast.success("Class deleted"); navigate("/app/classes"); } });
  const leave = useMutation({ mutationFn: () => api.del(`/classes/${classId}/members/${user.id}`), onSuccess: () => { invalidate(); toast.success("You left the class"); navigate("/app/classes"); } });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (error) return <EmptyState icon={BookOpen} title="Class not found" description="It may have been deleted, or you're not a member." />;

  const t = classTheme(classroom.theme);
  const tabs = TABS.filter((x) => !x.teacher || isTeacher);
  const active = tabs.find((x) => x.id === tab) ?? tabs[0];
  const Active = active.component;

  return (
    <div>
      <section className={cn("relative overflow-hidden rounded-3xl bg-linear-to-br p-5 text-[#16140f] sm:p-7", t.band)}>
        <div className="dot-grid absolute inset-0 opacity-25 [--fg:#000]" />
        <div className="absolute -right-10 -top-16 size-56 rounded-full bg-white/25 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium opacity-75">
              {[classroom.subject, classroom.section && `Section ${classroom.section}`].filter(Boolean).join(" · ") || "Class"}
              {classroom.archived ? " · Archived" : ""}
            </p>
            <h1 className="mt-1 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">{classroom.name}</h1>
            <p className="mt-2 text-sm opacity-75">
              {classroom.teacher?.name} · {plural(classroom._count.members, "student")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isTeacher ? <CodeButton code={classroom.code} /> : null}
            <Menu>
              <MenuTrigger asChild>
                <button className="grid size-9 place-items-center rounded-xl bg-white/85 text-[#16140f] shadow-sm backdrop-blur transition hover:bg-white" aria-label="Class options">
                  <MoreHorizontal className="size-4" />
                </button>
              </MenuTrigger>
              <MenuContent>
                {isTeacher ? (
                  <>
                    <MenuItem icon={Pencil} onSelect={() => setEditing(true)}>Edit class</MenuItem>
                    <MenuItem
                      icon={RefreshCw}
                      onSelect={async () => {
                        if (await confirm({ title: "Generate a new code?", description: "The old code will stop working. Existing students stay enrolled.", confirmLabel: "Generate" })) regenerate.mutate();
                      }}
                    >
                      New join code
                    </MenuItem>
                    <MenuItem icon={classroom.archived ? ArchiveRestore : Archive} onSelect={() => archive.mutate(!classroom.archived)}>
                      {classroom.archived ? "Restore class" : "Archive class"}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      icon={Trash2}
                      danger
                      onSelect={async () => {
                        if (await confirm({ title: `Delete ${classroom.name}?`, description: "All assignments, submissions, materials and announcements in this class will be permanently deleted.", confirmLabel: "Delete class", danger: true })) remove.mutate();
                      }}
                    >
                      Delete class
                    </MenuItem>
                  </>
                ) : (
                  <MenuItem
                    icon={LogOut}
                    danger
                    onSelect={async () => {
                      if (await confirm({ title: "Leave this class?", description: "You can rejoin later with the class code.", confirmLabel: "Leave", danger: true })) leave.mutate();
                    }}
                  >
                    Leave class
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          </div>
        </div>
      </section>

      <nav className="scroll-thin -mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Class sections">
        <div className="flex w-max gap-1 border-b border-border">
          {tabs.map(({ id, label, icon: Icon }) => (
            <NavLink
              key={id || "stream"}
              ref={active.id === id ? activeTabRef : undefined}
              to={`/app/classes/${classId}${id ? `/${id}` : ""}`}
              end
              className={({ isActive }) =>
                cn(
                  "relative inline-flex h-10 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors",
                  isActive || (active.id === id) ? "text-fg" : "text-muted hover:text-fg",
                )
              }
            >
              <Icon className="size-4" />
              {label}
              {active.id === id ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-500" /> : null}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="mt-6">
        <Active classroom={classroom} isTeacher={isTeacher} />
      </div>

      {isTeacher ? <ClassFormDialog open={editing} onOpenChange={setEditing} initial={classroom} /> : null}
    </div>
  );
}
