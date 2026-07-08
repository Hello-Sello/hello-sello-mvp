"use client";

/**
 * The Buy-page pencil-edit cell (Phase 18, Plan 09, BUY-01) — the ONLY UI surface
 * this phase adds for a buyer to insert/update their own resale price (net/gross)
 * per (partner, product). A NEW, standalone, per-cell autosave component — NOT a
 * reuse of Present's ProductCard batched-under-one-Save inline-edit model. That
 * model doesn't fit here (RESEARCH.md Pattern 4): this cell saves immediately on
 * Enter/blur, one cell at a time, with no page-wide Save/discard bar.
 *
 * State machine (CONTEXT.md's locked pencil-edit contract):
 *   idle (empty)  → dashed pink "insert" pill + pencil icon.
 *   idle (filled) → value + pencil icon (opacity increases on the parent row's
 *                   hover — the caller applies Tailwind `group` to the row so
 *                   `group-hover:` here can read it; this component has no
 *                   knowledge of the row itself).
 *   click pencil/pill → editing: autofocused numeric input, preselected with the
 *                   current value (or empty).
 *   Enter / blur  → calls onSave(parsedValue); success → idle; failure (rejected
 *                   promise, or a locally-invalid number) → inline error, stays
 *                   in editing so the value can be corrected (no silent no-op).
 *   Escape        → discards the draft, returns to idle — never calls onSave.
 *
 * Zero knowledge of DB1/margin/rollups — it only round-trips a number; recompute
 * after a save is entirely the caller's responsibility.
 */
import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

export function PencilEditCell(props: {
  value: number | null;
  onSave: (next: number) => Promise<void>;
  formatValue: (v: number) => string;
  /** Optional caller-supplied test id (e2e/buy-pencil-edit.spec.ts) — lets a
   *  caller distinguish e.g. a "net" cell from a "gross" cell in the same row. */
  testId?: string;
}) {
  const { value, onSave, formatValue, testId } = props;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards Enter+blur from double-committing (Enter fires commit, then the
  // input's own blur fires again) and guards Escape from letting the blur that
  // follows it also commit. Reset to false whenever a fresh commit attempt is
  // allowed (edit opened, or a prior attempt failed and needs a retry).
  const committedRef = useRef(false);

  // A STABLE ref, not an inline `ref={(el) => ...}` callback (code-review
  // fix): an inline arrow function is a new reference every render, so React
  // re-invokes it (null then set) on every keystroke's re-render, and
  // `el.select()` re-selecting the WHOLE value after every keystroke breaks
  // native multi-character typing (2nd digit replaces the 1st instead of
  // appending). The effect below focuses+selects exactly once when `editing`
  // flips true — never re-firing on a `draft` change.
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function openEdit() {
    setDraft(value == null ? "" : String(value));
    setError(null);
    committedRef.current = false;
    setEditing(true);
  }

  function cancel() {
    committedRef.current = true; // block the blur that follows Escape
    setEditing(false);
    setError(null);
  }

  async function commit() {
    if (committedRef.current) return;
    committedRef.current = true;

    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed) || parsed < 0) {
      setError("Enter a valid number.");
      committedRef.current = false; // allow retry
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(parsed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      committedRef.current = false; // allow retry
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5" data-testid={testId}>
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          aria-label="Edit value"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={() => void commit()}
          className="w-16 rounded border border-brand bg-white px-1 py-0.5 text-right text-xs tabular-nums focus:outline-none disabled:opacity-50"
        />
        {error && <span className="text-[10px] font-semibold text-rose-600">{error}</span>}
      </span>
    );
  }

  if (value == null) {
    return (
      <button
        type="button"
        onClick={openEdit}
        title="Can be inserted by the buyer"
        data-testid={testId}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand/50 bg-brand/[0.04] px-2.5 py-0.5 text-[10.5px] font-semibold text-brand-deep hover:border-brand hover:bg-brand/[0.08]"
      >
        <Pencil size={11} /> insert
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5" data-testid={testId}>
      <span className="tabular-nums">{formatValue(value)}</span>
      <button
        type="button"
        onClick={openEdit}
        aria-label="Edit value"
        title="Inserted by the buyer - click to update"
        className="inline-grid h-5 w-5 place-items-center rounded text-ink/45 opacity-45 transition-opacity group-hover:opacity-100 hover:bg-brand-soft/40 hover:text-brand-deep"
      >
        <Pencil size={11} />
      </button>
    </span>
  );
}
