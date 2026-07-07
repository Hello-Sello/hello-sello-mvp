"use client";

/**
 * Add-products drawer. Two ways in — both land on the SAME validation + atomic
 * import path (importProductsFromCsv → import_products RPC):
 *   • Upload CSV   — fill our template, upload, see per-cell errors, import.
 *   • Add manually — a form that builds a one-row CSV under the hood.
 * One authority for what a valid product is; the manual form is just a friendlier
 * front door to it.
 */
import { useRef, useState } from "react";
import { X, FileSpreadsheet, Download, Plus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { importProductsFromCsv, type ImportOutcome } from "@/modules/catalog/import";
import {
  templateCsv,
  buildCsv,
  UNIT_CODES,
  DOMINANCE_CODES,
  IRRADIATION_CODES,
} from "@/modules/catalog/template";
import { COUNTRIES } from "@/shared/geo/countries";

// Country names A→Z for the origin dropdown. `country_of_origin` is a free-text
// template column, so we submit the display NAME (what the card shows), not the
// ISO code — no import-side validation to satisfy.
const COUNTRY_NAMES = Object.values(COUNTRIES).sort((a, b) => a.localeCompare(b));

const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function downloadTemplate() {
  const blob = new Blob([templateCsv()], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hello-sello-product-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function AddProductsDrawer({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [tab, setTab] = useState<"csv" | "manual">("csv");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  if (!open) return null;

  async function runImport(csvText: string) {
    setBusy(true);
    setOutcome(null);
    const result = await importProductsFromCsv(csvText);
    setBusy(false);
    setOutcome(result);
    if (result.ok) onImported(result.imported);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="text-lg font-bold text-ink">Add products</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-4">
          {(["csv", "manual"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setOutcome(null); }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                tab === t ? "bg-brand text-white" : "bg-ink/5 text-ink/60 hover:bg-ink/10"
              }`}
            >
              {t === "csv" ? "Upload CSV" : "Add manually"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {tab === "csv" ? (
            <CsvTab busy={busy} onImport={runImport} />
          ) : (
            <ManualTab busy={busy} onImport={runImport} />
          )}
          {outcome && <Outcome outcome={outcome} />}
        </div>
      </div>
    </div>
  );
}

function CsvTab({ busy, onImport }: { busy: boolean; onImport: (csv: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsvText(await file.text());
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">
        Fill our template, then upload it here. Every product is checked before anything is saved —
        if a cell is wrong, nothing imports until you fix it.
      </p>
      <button
        onClick={downloadTemplate}
        className="flex items-center gap-2 rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-ink/5"
      >
        <Download size={16} /> Download template
      </button>

      <div
        onClick={() => fileRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/20 px-6 py-10 text-center hover:border-brand/50 hover:bg-brand-soft/20"
      >
        <FileSpreadsheet size={28} className="text-brand-deep" />
        <span className="text-sm font-semibold text-ink">
          {fileName ?? "Choose a CSV file"}
        </span>
        <span className="text-xs text-ink/45">.csv up to a few thousand rows</span>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onPick} />
      </div>

      <button
        disabled={!csvText || busy}
        onClick={() => csvText && onImport(csvText)}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
        Import products
      </button>
    </div>
  );
}

// Minimal manual add: the template's required columns + the common optionals,
// plus the curated Cluster-E subset (07-FIDELITY-CONTEXT.md "Add-product field
// parity") — the spec-row fields already shown on the card front that were
// previously CSV-only. NOT full ~30-column parity: batch/terpene/COGS/RRP/
// image-filename/visibility-date/bundle fields stay out (card's inline batch
// editor or later CSV covers those).
// Field key = exact template header so buildCsv can map it straight through.
// `Country` is rendered separately as a dropdown (below); the rest stay free text.
// `Packaging` = the packaging TYPE (glass jar / bag), distinct from the numeric
// "Pack size (g)" — the placeholder makes that difference obvious in the form.
const TEXT_FIELDS = [
  { header: "Product name", required: true },
  { header: "Cultivar", required: false },
  { header: "Supplier code", required: true },
  { header: "PZN", required: false },
  { header: "Region", required: false },
  { header: "Lineage A", required: false },
  { header: "Lineage B", required: false },
  { header: "Packaging", required: false, placeholder: "e.g. glass jar, bag" },
] as const;
const NUM_FIELDS = [
  { header: "THC %", required: true },
  { header: "CBD %", required: true },
  { header: "CBG %", required: false },
  { header: "CBN %", required: false },
  { header: "Pack size (g)", required: true },
  { header: "Basic price per g", required: true },
] as const;
const ENUM_FIELDS = [
  { header: "Unit", codes: UNIT_CODES },
  { header: "Dominance", codes: DOMINANCE_CODES },
  { header: "Irradiation", codes: IRRADIATION_CODES },
] as const;

function ManualTab({ busy, onImport }: { busy: boolean; onImport: (csv: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const set = (h: string, v: string) => setVals((p) => ({ ...p, [h]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const row: Record<string, string> = { ...vals };
    row["Show price publicly"] = vals["__pricePublic"] === "on" ? "yes" : "no";
    row["Resealable"] = vals["__resealable"] === "on" ? "yes" : "no";
    delete row["__pricePublic"];
    delete row["__resealable"];
    onImport(buildCsv([row]));
  }

  const input = "w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-brand focus:outline-none";

  return (
    <form onSubmit={submit} className="space-y-3">
      {TEXT_FIELDS.map((f) => (
        <label key={f.header} className="block">
          <span className="text-xs font-semibold text-ink/70">{f.header}{f.required && " *"}</span>
          <input
            className={input}
            required={f.required}
            placeholder={"placeholder" in f ? f.placeholder : undefined}
            value={vals[f.header] ?? ""}
            onChange={(e) => set(f.header, e.target.value)}
          />
        </label>
      ))}
      {/* Country of origin — a dropdown (free-text column, so the value is the name). */}
      <label className="block">
        <span className="text-xs font-semibold text-ink/70">Country</span>
        <select
          className={input}
          value={vals["Country"] ?? ""}
          onChange={(e) => set("Country", e.target.value)}
        >
          <option value="">Choose…</option>
          {COUNTRY_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        {NUM_FIELDS.map((f) => (
          <label key={f.header} className="block">
            <span className="text-xs font-semibold text-ink/70">{f.header}{f.required && " *"}</span>
            {/* text + decimal keypad, NOT type=number: the import validator reads
                German format (22,5) and treats "." as a thousands separator, so a
                native number input's "22.5" would be parsed as 225. */}
            <input
              type="text" inputMode="decimal"
              className={input}
              required={f.required}
              placeholder="z. B. 22,5"
              value={vals[f.header] ?? ""}
              onChange={(e) => set(f.header, e.target.value)}
            />
          </label>
        ))}
      </div>
      {ENUM_FIELDS.map((f) => (
        <label key={f.header} className="block">
          <span className="text-xs font-semibold text-ink/70">{f.header} *</span>
          <select
            className={input}
            required
            value={vals[f.header] ?? ""}
            onChange={(e) => set(f.header, e.target.value)}
          >
            <option value="" disabled>Choose…</option>
            {f.codes.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </select>
        </label>
      ))}
      <label className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          checked={vals["__pricePublic"] === "on"}
          onChange={(e) => set("__pricePublic", e.target.checked ? "on" : "")}
        />
        <span className="text-sm text-ink/70">Show price publicly (otherwise buyers see “Request pricing”)</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={vals["__resealable"] === "on"}
          onChange={(e) => set("__resealable", e.target.checked ? "on" : "")}
        />
        <span className="text-sm text-ink/70">Resealable</span>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        Add product
      </button>
    </form>
  );
}

function Outcome({ outcome }: { outcome: ImportOutcome }) {
  if (outcome.ok) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Imported {outcome.imported} product{outcome.imported === 1 ? "" : "s"}.</div>
          {outcome.extraHeaders.length > 0 && (
            <div className="mt-1 text-xs text-emerald-700">
              Ignored unknown columns: {outcome.extraHeaders.join(", ")}
            </div>
          )}
        </div>
      </div>
    );
  }
  if (outcome.stage === "insert") {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
        <AlertCircle size={18} className="mt-0.5 shrink-0" />
        <div><div className="font-semibold">Import failed</div><div className="mt-0.5 text-xs">{outcome.message}</div></div>
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
      <div className="flex items-center gap-2 font-semibold"><AlertCircle size={18} /> Fix these, then try again</div>
      {outcome.missingHeaders.length > 0 && (
        <div className="mt-2 text-xs">Missing required columns: {outcome.missingHeaders.join(", ")}</div>
      )}
      {outcome.errors.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
          {outcome.errors.map((e, i) => (
            <li key={i}>Row {e.row}, <span className="font-semibold">{e.column}</span>: {e.message}</li>
          ))}
        </ul>
      )}
      {outcome.extraHeaders.length > 0 && (
        <div className="mt-2 text-xs text-rose-600">Unknown columns (ignored): {outcome.extraHeaders.join(", ")}</div>
      )}
    </div>
  );
}
