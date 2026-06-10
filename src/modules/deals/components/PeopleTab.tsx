import type { MemberView } from "../types";

/**
 * The People tab (3b, REAL): live deal_member rows, owners first - ownership
 * is a role, one owner per company side (locked 3b). "(you)" follows the
 * logged-in viewer; adding members is the membership pass, not 3b.
 */
export function PeopleTab({ members }: { members: MemberView[] }) {
  return (
    <div className="glass rounded-2xl p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
          People ({members.length})
        </span>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="text-[11px] font-medium text-brand-deep/50"
        >
          + Add
        </button>
      </div>
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                m.isViewer ? "bg-brand text-white" : "bg-ink/10 text-ink/55"
              }`}
            >
              {initials(m.name)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-ink">
                {m.name}
                {m.isViewer && <span className="ml-1 text-[10px] text-brand-deep">(you)</span>}
              </div>
              <div className="truncate text-[10px] text-ink/45">
                {roleLabel(m.role)} · {m.companyName}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-ink/40">
        Each side&apos;s owner can add more people from their own company (e.g. logistics,
        compliance).
      </p>
    </div>
  );
}

function roleLabel(role: MemberView["role"]): string {
  if (role === "owner") return "Deal owner";
  if (role === "side_lead") return "Side lead";
  return "Member";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
