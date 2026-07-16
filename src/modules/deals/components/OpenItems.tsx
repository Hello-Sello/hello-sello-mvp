"use client";

/**
 * Open items (07-07, D-15) - the card's FLAT, shared to-do list. Stages are fully
 * retired (D-15): one un-grouped list of Things, inline-editable on the card.
 *
 * Look: a clean WHITE ledger. Each row is one straight line -
 *   [ done box ] [ UPLOAD/APPROVE pill ] [ note … @Name ] ...... [ assign ][ lock ][ delete ]
 * The action pills are the only colour at rest; @mentions inside the note render
 * pink. The three end controls (assign / private-lock / delete) are ALWAYS shown,
 * in a straight line. Only a DONE row gets a soft solid-pink highlight; nothing is
 * dashed.
 *
 * Assignment is WhatsApp-style and lives INLINE in the note as "@Name": type "@"
 * anywhere (start / middle / end) and it stays there; or, if you never typed one,
 * pick someone from the assign button and "@Name" is appended at the END. There is
 * NO separate assignee chip - one representation only. Both companies' rosters are
 * assignable.
 *
 * Add flow: "+ Add something" → choose Private/Shared, then Free text / Upload /
 * Approve. Upload is FRONT-END ONLY for now (the picked file is a local object URL,
 * shown as an icon and downloadable in-session, not yet stored on a server).
 */
import { useRef, useState } from "react";
import {
  Check,
  Download,
  Lock,
  Paperclip,
  Plus,
  Search,
  Trash2,
  Type,
  Unlock,
  Upload,
  UserPlus,
} from "lucide-react";
import {
  createThing,
  removeThing,
  renameThing,
  setThingVisibility,
  toggleThingStatus,
} from "../supabase/writes";
import type { MemberView, ThingType, ThingView } from "../types";

/** The action word each Thing kind leads with (D-15). */
const ACTION_WORD: Record<ThingType, string | null> = {
  document_upload: "Upload",
  approval: "Approve",
  task: null,
};

/** The three "Add something" choices → the stored Thing type. */
type DraftKind = "free" | "upload" | "approve";
const DRAFT_TYPE: Record<DraftKind, ThingType> = {
  free: "task",
  upload: "document_upload",
  approve: "approval",
};

interface Draft {
  kind: DraftKind;
  isPrivate: boolean;
  text: string;
  file: { name: string; url: string } | null;
  atQuery: string | null; // null = the people list is closed
  atPos: number;
}

/** Render a note, colouring any "@mention" pink. */
function renderNote(text: string) {
  return text.split(/(@[^\s@]+)/g).map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="font-semibold text-[color:var(--dc-pink-deep)]">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function OpenItems({
  things,
  workspaceId,
  people = [],
  viewerPersonId,
  viewerCompanyId,
}: {
  things: ThingView[];
  /** the deal_workspace_id - required to inline-add (createThing). Absent = read-only. */
  workspaceId?: string | null;
  /** both companies' rosters - the assignable people. */
  people?: MemberView[];
  /** the viewer's person - the @mention reads "You" for them. */
  viewerPersonId?: string | null;
  /** the viewer's company - filters private items + owns a new private item. */
  viewerCompanyId?: string | null;
}) {
  const [items, setItems] = useState<ThingView[]>(things);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addPrivate, setAddPrivate] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [assignOpenId, setAssignOpenId] = useState<string | null>(null);
  // local (front-end only) uploaded files, by thing id -> object URL + name.
  const [files, setFiles] = useState<Record<string, { name: string; url: string }>>({});
  const uploadFor = useRef<string | null>(null); // thing id, or "draft"
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-seed when the card re-reads (React's "adjust state when a prop changes").
  const [prevThings, setPrevThings] = useState(things);
  if (prevThings !== things) {
    setPrevThings(things);
    setItems(things);
  }

  /** How a person reads when woven into the note: "You" for the viewer, else first name. */
  function tagFor(p: MemberView): string {
    return p.personId === viewerPersonId ? "You" : p.name.split(" ")[0];
  }

  // D-15 privacy: a private item shows only to its owner's side (RLS + this guard).
  const visible = items.filter(
    (t) => !t.isPrivate || (viewerCompanyId != null && t.ownerCompanyId === viewerCompanyId),
  );
  const doneCount = visible.filter((t) => t.status === "done").length;

  async function onToggle(t: ThingView) {
    if (busyId) return;
    const next = t.status === "done" ? "open" : "done";
    setBusyId(t.id);
    setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      await toggleThingStatus(t.id, next);
    } catch {
      setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
    } finally {
      setBusyId(null);
    }
  }

  async function onToggleVisibility(t: ThingView) {
    if (busyId) return;
    const nextPrivate = !t.isPrivate;
    const nextOwner = nextPrivate ? viewerCompanyId ?? t.ownerCompanyId ?? null : null;
    setBusyId(t.id);
    setItems((cur) =>
      cur.map((x) =>
        x.id === t.id ? { ...x, isPrivate: nextPrivate, ownerCompanyId: nextOwner } : x,
      ),
    );
    try {
      await setThingVisibility(t.id, nextPrivate, nextOwner);
    } catch {
      setItems((cur) =>
        cur.map((x) =>
          x.id === t.id
            ? { ...x, isPrivate: t.isPrivate, ownerCompanyId: t.ownerCompanyId }
            : x,
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  // Assign from a row when no "@" was typed: append " @Name" onto the END of the
  // note (renameThing) - the one, inline representation.
  async function appendMention(t: ThingView, person: MemberView) {
    if (busyId) return;
    setAssignOpenId(null);
    const nextTitle = `${t.title.trimEnd()} @${tagFor(person)}`.trim();
    setBusyId(t.id);
    setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, title: nextTitle } : x)));
    try {
      await renameThing(t.id, nextTitle);
    } catch {
      setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, title: t.title } : x)));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(t: ThingView) {
    if (busyId) return;
    const prev = items;
    setBusyId(t.id);
    setItems((cur) => cur.filter((x) => x.id !== t.id));
    try {
      await removeThing(t.id);
    } catch {
      setItems(prev);
    } finally {
      setBusyId(null);
    }
  }

  // ---- the "Add something" flow ---------------------------------------------

  function openType(kind: DraftKind) {
    setAddMenuOpen(false);
    setDraft({
      kind,
      isPrivate: addPrivate,
      text: kind === "approve" ? "@" : "",
      file: null,
      atQuery: kind === "approve" ? "" : null,
      atPos: 0,
    });
  }

  function onDraftText(value: string) {
    setDraft((d) => {
      if (!d) return d;
      const at = value.lastIndexOf("@");
      const opens = at >= 0 && (at === 0 || value[at - 1] === " ");
      return {
        ...d,
        text: value,
        atQuery: opens ? value.slice(at + 1) : null,
        atPos: opens ? at : d.atPos,
      };
    });
  }

  // Pick from the @-list: replace the @query with "@Name" INLINE where the @ sits
  // (it may be start / middle / end) - the name stays in the note text.
  function pickDraftMention(person: MemberView) {
    setDraft((d) => {
      if (!d) return d;
      const before = d.text.slice(0, d.atPos);
      const after = d.text.slice(d.atPos + 1 + (d.atQuery?.length ?? 0));
      return { ...d, text: `${before}@${tagFor(person)} ${after}`, atQuery: null };
    });
  }

  async function commitDraft() {
    if (!draft || !workspaceId || busyId === "add") return;
    const title = draft.text.trim();
    if (!title) return;
    setBusyId("add");
    try {
      const created = await createThing({
        workspaceId,
        title,
        type: DRAFT_TYPE[draft.kind],
        isPrivate: draft.isPrivate,
        ownerCompanyId: draft.isPrivate ? viewerCompanyId ?? null : null,
        sortOrder: items.length,
      });
      if (draft.file) {
        setFiles((f) => ({ ...f, [created.id]: draft.file! }));
        setItems((cur) => [...cur, { ...created, status: "done" }]);
        void toggleThingStatus(created.id, "done").catch(() => {});
      } else {
        setItems((cur) => [...cur, created]);
      }
      setDraft(null);
    } catch {
      // keep the draft so the user can retry
    } finally {
      setBusyId(null);
    }
  }

  // ---- uploads (front-end only) ---------------------------------------------

  function pickFile(target: string) {
    uploadFor.current = target;
    fileInputRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    const target = uploadFor.current;
    uploadFor.current = null;
    e.target.value = "";
    if (!f || !target) return;
    const entry = { name: f.name, url: URL.createObjectURL(f) };
    if (target === "draft") {
      setDraft((d) => (d ? { ...d, file: entry } : d));
      return;
    }
    setFiles((cur) => ({ ...cur, [target]: entry }));
    setItems((cur) => cur.map((x) => (x.id === target ? { ...x, status: "done" } : x)));
    void toggleThingStatus(target, "done").catch(() => {});
  }

  function download(entry: { name: string; url: string }) {
    const a = document.createElement("a");
    a.href = entry.url;
    a.download = entry.name;
    a.click();
  }

  const canAssign = !!workspaceId && people.length > 0;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--dc-ink-38)]">
          Things to do
        </span>
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand/12 px-1.5 font-mono text-[10px] font-bold tabular-nums text-[color:var(--dc-pink-deep)]">
          {visible.length - doneCount}
        </span>
      </div>

      {visible.length === 0 && !draft && (
        <p className="py-1 text-[12px] text-[color:var(--dc-ink-38)]">No open items yet.</p>
      )}

      <ul className="flex flex-col gap-0.5">
        {visible.map((t) => {
          const done = t.status === "done";
          const word = ACTION_WORD[t.type];
          const file = files[t.id];

          return (
            <li
              key={t.id}
              className={`-mx-2 flex items-start gap-2.5 rounded-xl px-2 py-2 transition ${
                done ? "bg-brand/[0.06]" : "hover:bg-black/[0.03]"
              }`}
            >
              {/* done box */}
              <button
                type="button"
                onClick={() => void onToggle(t)}
                disabled={busyId === t.id}
                aria-label={done ? "Mark open" : "Mark done"}
                className={`mt-px grid h-[19px] w-[19px] shrink-0 place-items-center rounded-md border-[1.5px] transition ${
                  done
                    ? "border-[color:var(--dc-pink)] bg-[color:var(--dc-pink)]"
                    : "border-black/20 bg-white hover:border-[color:var(--dc-pink)]"
                }`}
              >
                {done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </button>

              {/* action pill (Upload / Approve). Upload becomes a download icon once
                  a file is attached. */}
              {t.type === "document_upload" ? (
                file ? (
                  <button
                    type="button"
                    onClick={() => download(file)}
                    title="Download the uploaded file"
                    aria-label="Download the uploaded file"
                    className="group/dl mt-px shrink-0 text-[color:var(--dc-pink-deep)] transition hover:text-[color:var(--dc-pink)]"
                  >
                    <Paperclip className="h-4 w-4 group-hover/dl:hidden" />
                    <Download className="hidden h-4 w-4 group-hover/dl:block" />
                  </button>
                ) : (
                  <ActionPill icon={Upload} label={word!} onClick={() => pickFile(t.id)} />
                )
              ) : word ? (
                <ActionPill icon={Check} label={word} />
              ) : null}

              {/* the note - wraps freely; @mentions render pink inline */}
              <span
                className={`min-w-0 flex-1 whitespace-pre-wrap break-words pt-px text-[13px] leading-snug ${
                  done ? "text-[color:var(--dc-ink-55)]" : "text-[color:var(--dc-ink)]"
                }`}
              >
                {renderNote(t.title)}
              </span>

              {/* the three end controls, always shown in a straight line:
                  assign · private-lock · delete */}
              <div className="mt-px flex shrink-0 items-center gap-2.5 text-[color:var(--dc-ink-38)]">
                {canAssign && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setAssignOpenId((id) => (id === t.id ? null : t.id))}
                      disabled={busyId === t.id}
                      title="Assign to someone"
                      aria-label="Assign to someone"
                      aria-haspopup="menu"
                      aria-expanded={assignOpenId === t.id}
                      className="flex transition hover:text-[color:var(--dc-pink)]"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                    {assignOpenId === t.id && (
                      <PeopleList
                        people={people}
                        viewerPersonId={viewerPersonId}
                        onPick={(p) => void appendMention(t, p)}
                        onClose={() => setAssignOpenId(null)}
                        search
                      />
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void onToggleVisibility(t)}
                  disabled={busyId === t.id}
                  title={t.isPrivate ? "Private - only your side" : "Shared with both sides"}
                  aria-label="Toggle visibility"
                  className={`transition hover:text-[color:var(--dc-pink-deep)] ${
                    t.isPrivate ? "text-[color:var(--dc-pink-deep)]" : ""
                  }`}
                >
                  {t.isPrivate ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(t)}
                  disabled={busyId === t.id}
                  title="Delete"
                  aria-label="Delete"
                  className="flex transition hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* the draft row (a type was picked) */}
      {draft && (
        <div className="relative -mx-2 mt-1 flex items-start gap-2.5 rounded-xl bg-brand/[0.04] px-2 py-2">
          <span className="mt-px h-[19px] w-[19px] shrink-0 rounded-md border-[1.5px] border-black/20 bg-white opacity-60" />
          {draft.kind === "upload" &&
            (draft.file ? (
              <span className="mt-px shrink-0 text-[color:var(--dc-pink-deep)]">
                <Paperclip className="h-4 w-4" />
              </span>
            ) : (
              <ActionPill icon={Upload} label="Upload" onClick={() => pickFile("draft")} />
            ))}
          {draft.kind === "approve" && <ActionPill icon={Check} label="Approve" />}
          <input
            value={draft.text}
            onChange={(e) => onDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (draft.atQuery !== null) {
                  const m = filterPeople(people, draft.atQuery);
                  if (m.length) pickDraftMention(m[0]);
                  return;
                }
                void commitDraft();
              }
              if (e.key === "Escape") setDraft(null);
            }}
            autoFocus
            placeholder="write it… @ tags someone · Enter adds it"
            className="mt-px min-w-0 flex-1 bg-transparent pt-px text-[13px] leading-snug text-[color:var(--dc-ink)] outline-none placeholder:text-[color:var(--dc-ink-38)]"
          />
          <button
            type="button"
            onClick={() => void commitDraft()}
            disabled={!draft.text.trim() || busyId === "add"}
            className="shrink-0 rounded-full bg-[color:var(--dc-pink)] px-3.5 py-1 text-[11px] font-bold text-white transition hover:bg-[color:var(--dc-pink-deep)] disabled:opacity-50"
          >
            Add
          </button>
          {draft.atQuery !== null && (
            <PeopleList
              people={filterPeople(people, draft.atQuery)}
              viewerPersonId={viewerPersonId}
              onPick={pickDraftMention}
              onClose={() => setDraft((d) => (d ? { ...d, atQuery: null } : d))}
              anchor="left"
            />
          )}
        </div>
      )}

      {/* the "+ Add something" button + its type menu */}
      {workspaceId && !draft && (
        <div className="relative mt-2.5 inline-block">
          <button
            type="button"
            onClick={() => setAddMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            className="flex items-center gap-1.5 rounded-full border border-[color:var(--dc-pink)]/30 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[color:var(--dc-pink-deep)] transition hover:bg-brand/[0.05]"
          >
            <Plus className="h-3.5 w-3.5" /> Add something
          </button>
          {addMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAddMenuOpen(false)} />
              <div className="glass-strong absolute bottom-full left-0 z-20 mb-1.5 w-56 rounded-2xl p-1.5">
                <button
                  type="button"
                  onClick={() => setAddPrivate((p) => !p)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold transition ${
                    addPrivate
                      ? "bg-brand/10 text-[color:var(--dc-pink-deep)]"
                      : "text-[color:var(--dc-ink)] hover:bg-black/[0.04]"
                  }`}
                >
                  <Lock className="h-3.5 w-3.5 shrink-0" /> Private / secret
                  <span className="ml-auto text-[10px] font-medium text-[color:var(--dc-ink-38)]">
                    {addPrivate ? "on · only you" : "choose first"}
                  </span>
                </button>
                <div className="my-1 h-px bg-black/5" />
                <MenuItem icon={Type} label="Free text" onClick={() => openType("free")} />
                <MenuItem icon={Upload} label="Upload" onClick={() => openType("upload")} />
                <MenuItem
                  icon={UserPlus}
                  label="Approve"
                  hint="@ someone"
                  onClick={() => openType("approve")}
                />
              </div>
            </>
          )}
        </div>
      )}

      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />
    </div>
  );
}

/** The white pink-outlined action pill (UPLOAD / APPROVE). */
function ActionPill({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Upload;
  label: string;
  onClick?: () => void;
}) {
  const cls =
    "mt-px inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--dc-pink)]/30 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[color:var(--dc-pink-deep)]";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition hover:bg-brand/[0.05]`}>
      <Icon className="h-3 w-3" /> {label}
    </button>
  ) : (
    <span className={cls}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

/** Filter the roster by a name query (case-insensitive). */
function filterPeople(people: MemberView[], query: string): MemberView[] {
  const q = query.trim().toLowerCase();
  return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
}

/** A small item in the "Add something" type menu. */
function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Type;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium text-[color:var(--dc-ink)] transition hover:bg-black/[0.04]"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--dc-pink-deep)]" /> {label}
      {hint && <span className="ml-auto text-[10px] text-[color:var(--dc-ink-38)]">{hint}</span>}
    </button>
  );
}

/**
 * A floating list of people to assign. Used both for a row's assign button (with
 * its own search) and the draft's live @-mention list (pre-filtered). BOTH
 * companies' rosters show, "You" first-name-labelled.
 */
function PeopleList({
  people,
  viewerPersonId,
  onPick,
  onClose,
  anchor = "right",
  search = false,
}: {
  people: MemberView[];
  viewerPersonId?: string | null;
  onPick: (p: MemberView) => void;
  onClose: () => void;
  anchor?: "left" | "right";
  search?: boolean;
}) {
  const [q, setQ] = useState("");
  const shown = search ? filterPeople(people, q) : people;
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        className={`glass-strong absolute top-full z-20 mt-1.5 max-h-56 w-60 overflow-y-auto rounded-2xl p-1.5 ${
          anchor === "right" ? "right-0" : "left-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {search && (
          <div className="mb-1 flex items-center gap-1.5 rounded-lg bg-black/[0.04] px-2 py-1.5">
            <Search className="h-3 w-3 text-[color:var(--dc-ink-38)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              placeholder="Search people…"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[color:var(--dc-ink)] outline-none placeholder:text-[color:var(--dc-ink-38)]"
            />
          </div>
        )}
        {shown.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-[color:var(--dc-ink-38)]">No match.</p>
        ) : (
          shown.map((p) => (
            <button
              key={p.personId}
              type="button"
              onClick={() => onPick(p)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-black/[0.04]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-[color:var(--dc-ink)]">
                  {p.personId === viewerPersonId ? "You" : p.name}
                </span>
                <span className="block truncate text-[10.5px] text-[color:var(--dc-ink-38)]">
                  {p.companyName}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </>
  );
}
