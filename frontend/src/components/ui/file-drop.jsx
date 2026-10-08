import { useRef, useState } from "react";
import { FileText, ImageIcon, Paperclip, UploadCloud, X } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { fileUrl } from "@/lib/api";

const MAX_MB = 15;

export function fileIcon(mime = "") {
  return mime.startsWith("image/") ? ImageIcon : FileText;
}

/**
 * Drag-and-drop / click-to-browse picker.
 * Controlled: `files` (File[]) and `onChange(files)`.
 */
export function FileDrop({ files = [], onChange, accept, multiple = true, max = 6, label, hint, compact, className, capture }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");

  const add = (list) => {
    setError("");
    const incoming = [...list];
    const tooBig = incoming.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) setError(`${tooBig.name} is larger than ${MAX_MB} MB.`);
    const ok = incoming.filter((f) => f.size <= MAX_MB * 1024 * 1024);
    const next = multiple ? [...files, ...ok].slice(0, max) : ok.slice(0, 1);
    if (multiple && files.length + ok.length > max) setError(`You can attach up to ${max} files.`);
    onChange(next);
  };

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-2/60 text-center transition-colors hover:border-brand-500 hover:bg-brand-50/40 dark:hover:bg-brand-500/5",
          compact ? "gap-1 px-4 py-4" : "gap-2 px-6 py-8",
          over && "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10",
        )}
      >
        <UploadCloud className={cn("text-muted", compact ? "size-5" : "size-7")} />
        <p className="text-sm font-medium">{label ?? (multiple ? "Drop files or click to browse" : "Drop a file or click to browse")}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          capture={capture}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      {files.length ? (
        <ul className="mt-3 space-y-2">
          {files.map((f, i) => (
            <FileChip key={`${f.name}-${i}`} name={f.name} size={f.size} mime={f.type} onRemove={() => onChange(files.filter((_, j) => j !== i))} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A file row. Pass `url` to make it a link, `onRemove` to show a remove button. */
export function FileChip({ name, size, mime, url, onRemove, className }) {
  const Icon = mime ? fileIcon(mime) : Paperclip;
  const body = (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {size ? <span className="block text-xs text-faint">{formatBytes(size)}</span> : null}
      </span>
    </>
  );
  return (
    <li className={cn("flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2", className)}>
      {url ? (
        <a href={fileUrl(url)} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
          {body}
        </a>
      ) : (
        body
      )}
      {onRemove ? (
        <button type="button" onClick={onRemove} className="rounded-md p-1 text-faint hover:bg-subtle hover:text-fg" aria-label={`Remove ${name}`}>
          <X className="size-4" />
        </button>
      ) : null}
    </li>
  );
}
