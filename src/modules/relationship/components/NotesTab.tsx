"use client";

import { useState } from "react";
import { Building2, Lock } from "lucide-react";
import { saveNote } from "../supabase/writes";
import type { NoteScope, NoteView } from "../types";

/**
 * Notes tab (Phase 5) - editable team + personal notes for the viewer's side.
 *   - Team note: shared with the viewer's own company.
 *   - Personal note: private to the author (RLS: created_by = auth.uid()).
 * The other side never sees either (RLS filters by company first), so we don't
 * need to spell that out in the UI.
 *
 * One note per scope in the demo UX: an existing note edits in place, an absent
 * one is created on first save. Local state holds the two notes so a save shows
 * instantly without reloading the whole record.
 */
export function NotesTab({
  relationshipId,
  notes,
}: {
  relationshipId: string;
  notes: NoteView[];
}) {
  const [team, setTeam] = useState<NoteView | null>(
    notes.find((n) => n.scope === "team") ?? null,
  );
  const [personal, setPersonal] = useState<NoteView | null>(
    notes.find((n) => n.scope === "personal") ?? null,
  );

  return (
    <div className="space-y-3">
      <NoteSlot
        relationshipId={relationshipId}
        scope="team"
        icon={<Building2 size={13} strokeWidth={1.75} className="text-ink/45" />}
        label="Team note"
        hint="your company sees this"
        tone="team"
        note={team}
        onSaved={setTeam}
      />
      <NoteSlot
        relationshipId={relationshipId}
        scope="personal"
        icon={<Lock size={13} strokeWidth={1.75} className="text-ink/45" />}
        label="Personal note"
        hint="only you"
        tone="personal"
        note={personal}
        onSaved={setPersonal}
      />
    </div>
  );
}

function NoteSlot({
  relationshipId,
  scope,
  icon,
  label,
  hint,
  tone,
  note,
  onSaved,
}: {
  relationshipId: string;
  scope: NoteScope;
  icon: React.ReactNode;
  label: string;
  hint: string;
  tone: "team" | "personal";
  note: NoteView | null;
  onSaved: (n: NoteView) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyTone = tone === "personal" ? "bg-brand/5" : "bg-white/50";

  function startEdit() {
    setDraft(note?.body ?? "");
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    const body = draft.trim();
    if (!body) {
      setError("Write something first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveNote({
        relationshipId,
        scope,
        body,
        existingId: note?.id ?? null,
      });
      onSaved(saved);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-medium text-ink/60">{label}</span>
        <span className="text-[10px] text-ink/35">· {hint}</span>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="ml-auto text-[11px] font-medium text-brand transition hover:underline"
          >
            {note ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-[12px] text-ink/80 outline-none focus:border-brand/40"
            placeholder={
              tone === "personal"
                ? "A private reminder only you can see…"
                : "A note your whole company can see…"
            }
          />
          {error && <p className="text-[11px] text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-brand px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-brand-deep disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="text-[11px] font-medium text-ink/45 transition hover:text-ink/70"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={`rounded-lg ${bodyTone} px-3 py-2 text-[12px] text-ink/70`}>
          {note ? note.body : <span className="text-ink/35">No {label.toLowerCase()} yet.</span>}
        </div>
      )}
    </div>
  );
}
