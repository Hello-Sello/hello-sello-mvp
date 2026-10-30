import { Check, Minus, Star } from "lucide-react";

/** Numbered header shared by the three builder pillars. */
export function PillarHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">
        {n}
      </span>
      <h2 className="text-lg font-extrabold tracking-tight text-ink">{title}</h2>
      {hint && <span className="ml-auto text-xs font-semibold text-ink-muted">{hint}</span>}
    </div>
  );
}

export function Checkbox({ state }: { state: "on" | "off" | "some" }) {
  return (
    <span
      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition ${
        state === "off" ? "border-black/20 bg-white" : "border-brand bg-brand text-white"
      }`}
    >
      {state === "on" && <Check size={12} strokeWidth={3} />}
      {state === "some" && <Minus size={12} strokeWidth={3} />}
    </span>
  );
}

export function StarButton({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={on ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      aria-pressed={on}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition hover:bg-black/[0.05] ${
        on ? "text-brand" : "text-ink/25 hover:text-ink/60"
      }`}
    >
      <Star size={15} fill={on ? "currentColor" : "none"} />
    </button>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-1.5">
      {icon}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm outline-none placeholder:text-ink-muted/70"
      />
    </label>
  );
}

export function initials(name: string) {
  return name
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
