"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DEMO_PRODUCTS, productLine } from "../data";
import { Checkbox, PillarHeader, SearchField } from "./ui";

/** Pillar 1 — pick products. Compact one-row-per-product list. */
export function ProductPillar({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? DEMO_PRODUCTS.filter((p) => p.name.toLowerCase().includes(q)) : DEMO_PRODUCTS;
  }, [query]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <section className="glass flex min-h-0 flex-col rounded-3xl p-4">
      <PillarHeader n={1} title="Products" hint={`${selected.size} selected`} />

      <div className="mt-3">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search products"
          icon={<Search size={14} className="text-ink-muted" />}
        />
      </div>

      <ul className="mt-2 flex h-[360px] flex-col overflow-auto pr-1">
        {visible.map((p) => {
          const on = selected.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition ${
                  on ? "bg-brand/[0.07]" : "hover:bg-black/[0.03]"
                }`}
              >
                <Checkbox state={on ? "on" : "off"} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[13px] font-semibold text-ink">{p.name}</span>
                  <span className="block truncate text-[11px] text-ink-muted">{productLine(p)}</span>
                </span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && <li className="py-6 text-center text-sm text-ink-muted">No products match.</li>}
      </ul>

      {selected.size > 0 && (
        <button
          type="button"
          onClick={() => onChange(new Set())}
          className="mt-2 self-start text-xs font-semibold text-ink-muted hover:text-ink"
        >
          Clear selection
        </button>
      )}
    </section>
  );
}
