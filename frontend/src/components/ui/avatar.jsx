import { useState } from "react";
import { cn, initials } from "@/lib/utils";
import { fileUrl } from "@/lib/api";

const PALETTE = [
  "bg-amber-200 text-amber-950",
  "bg-sky-200 text-sky-950",
  "bg-violet-200 text-violet-950",
  "bg-emerald-200 text-emerald-950",
  "bg-rose-200 text-rose-950",
  "bg-orange-200 text-orange-950",
  "bg-teal-200 text-teal-950",
  "bg-lime-200 text-lime-950",
];

const hash = (s = "") => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const sizes = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg", xl: "size-20 text-2xl" };

export function Avatar({ name, src, size = "sm", className }) {
  const [broken, setBroken] = useState(false);
  const url = fileUrl(src);
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold", sizes[size], !url || broken ? PALETTE[hash(name) % PALETTE.length] : "bg-subtle", className)}>
      {url && !broken ? <img src={url} alt="" className="size-full object-cover" onError={() => setBroken(true)} /> : initials(name)}
    </span>
  );
}

export function AvatarStack({ people = [], max = 4, size = "xs" }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} src={p.avatarUrl} size={size} className="ring-2 ring-surface" />
      ))}
      {extra > 0 ? <span className={cn("inline-grid place-items-center rounded-full bg-subtle font-medium text-muted ring-2 ring-surface", sizes[size])}>+{extra}</span> : null}
    </div>
  );
}
