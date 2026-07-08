"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Check, Eye, Filter, MoreVertical, Printer, Send } from "lucide-react";
import type { SellerOrderRow } from "@/modules/allocate/orders";
import type { OrderStatusCode } from "@/modules/allocate/status";

/**
 * Orders & offers — the seller's order inbox (Task 2, 260707-0ob plan 2).
 * Faithful port of `prototypes/allocate-prototype/index.html`'s Excel-style
 * `renderOrderHead`/`setOSort`/`toggleOFilter` table, over the REAL
 * `getSellerOrders()` read (Plan 4 passes the rows in as a server-fetched
 * prop — this component owns no data fetching itself).
 *
 * Row click + the ⋮ menu's View both dispatch `hs:open-deal-card` — the same
 * window-event contract `AllocateDealCardHost` listens for, so opening an
 * order always opens the REAL deal card (`DealCard`), never a rebuilt
 * receipt UI (T-260707-05 is a UI-only accept for Send/Print below).
 */

const ORDERED_VIA_LABELS: Record<SellerOrderRow["orderedVia"], string> = {
  hello_sello: "Hello Sello",
  email: "E-mail",
  fax: "Fax",
};
const ORDERED_VIA_CODES = Object.keys(ORDERED_VIA_LABELS) as SellerOrderRow["orderedVia"][];

const STATUS_LABELS: Record<OrderStatusCode, string> = {
  sales_offer: "Sales offer",
  purchase_order: "Purchase order",
  accepted: "Deal accepted",
  executed: "Deal executed",
  update: "Deal update",
  ticket: "Ticket created",
  ticket_closed: "Ticket closed",
  cancelled: "Cancelled",
};
const STATUS_CODES = Object.keys(STATUS_LABELS) as OrderStatusCode[];

/** Status chip colours, per <interfaces> — pink for the two birth modes,
 *  yellow/green/amber for the lifecycle, info-blue for an open ticket, a
 *  darker green for a closed one, and a neutral grey for the cancelled/
 *  withdrawn edge case (outside the locked 7-vocab, so it gets none of the
 *  7 real colours). */
const STATUS_STYLES: Record<OrderStatusCode, string> = {
  sales_offer: "bg-brand/10 text-brand-deep",
  purchase_order: "bg-brand/10 text-brand-deep",
  accepted: "bg-yellow-100 text-yellow-800",
  executed: "bg-success/10 text-success",
  update: "bg-amber-50 text-amber-600",
  ticket: "bg-info/10 text-info",
  ticket_closed: "bg-emerald-900/10 text-emerald-900",
  cancelled: "bg-black/5 text-ink-muted",
};

const MONTH_INDEX: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** Parses the already-formatted `DD-Mon-YY` display string back into a
 *  sortable timestamp — the same "sort the display string" discipline the
 *  prototype's `dateKey()` uses, since `receivedAt`/`deliveryAt` never carry
 *  a separate raw ISO value (formatOrderDate is the single owner). */
function parseOrderDate(s: string): number {
  const [dd, mon, yy] = s.split("-");
  return new Date(2000 + Number(yy), MONTH_INDEX[mon] ?? 0, Number(dd)).getTime();
}

type SortKey = "customer" | "customerTop" | "received" | "delivery" | "sku";
type SortState = { key: SortKey | null; dir: 1 | -1 };
type FilterState = {
  orderedVia: Set<SellerOrderRow["orderedVia"]>;
  status: Set<OrderStatusCode>;
};

function applySortAndFilter(orders: SellerOrderRow[], sort: SortState, filter: FilterState) {
  let rows = orders.filter(
    (o) =>
      (filter.orderedVia.size === 0 || filter.orderedVia.has(o.orderedVia)) &&
      (filter.status.size === 0 || filter.status.has(o.status.code)),
  );

  if (sort.key === "customerTop") {
    // "Top accounts first" — pre-sort by each order's own value_net desc.
    // Same signal isKeyAccount classifies by (see status.ts), simpler than
    // threading a per-buyer keyAccountRank onto every row (<interfaces>).
    rows = [...rows].sort((a, b) => (b.valueNet ?? 0) - (a.valueNet ?? 0));
  } else if (sort.key === "customer") {
    rows = [...rows].sort((a, b) => a.customerName.localeCompare(b.customerName) * sort.dir);
  } else if (sort.key === "received") {
    rows = [...rows].sort(
      (a, b) => (parseOrderDate(a.receivedAt) - parseOrderDate(b.receivedAt)) * sort.dir,
    );
  } else if (sort.key === "delivery") {
    rows = [...rows].sort((a, b) => {
      const av = a.deliveryAt ? parseOrderDate(a.deliveryAt) : Infinity;
      const bv = b.deliveryAt ? parseOrderDate(b.deliveryAt) : Infinity;
      return (av - bv) * sort.dir;
    });
  } else if (sort.key === "sku") {
    rows = [...rows].sort((a, b) => (a.skuCount - b.skuCount) * sort.dir);
  }
  return rows;
}

function openDealCard(dealCardId: string) {
  window.dispatchEvent(new CustomEvent("hs:open-deal-card", { detail: { dealCardId } }));
}

export function OrdersTable({ orders }: { orders: SellerOrderRow[] }) {
  const [sort, setSort] = useState<SortState>({ key: null, dir: 1 });
  const [filter, setFilter] = useState<FilterState>({
    orderedVia: new Set(),
    status: new Set(),
  });
  const [openMenu, setOpenMenu] = useState<string | null>(null); // "head:<col>" | "row:<id>" | null
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // any outside click closes whichever dropdown is open — same discipline as
  // the prototype's document-level closeDots() listener.
  useEffect(() => {
    if (!openMenu) return;
    function onDocClick() {
      setOpenMenu(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [openMenu]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  const rows = useMemo(() => applySortAndFilter(orders, sort, filter), [orders, sort, filter]);

  function toggleFilter<K extends keyof FilterState>(key: K, value: FilterState[K] extends Set<infer T> ? T : never) {
    setFilter((prev) => {
      const next = new Set(prev[key] as Set<typeof value>);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [key]: next };
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight text-ink">Orders &amp; offers</h2>
      </div>

      <div className="glass overflow-visible rounded-2xl">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <Th>Order Nr.</Th>
              <SortableTh
                label="Customer"
                colKey="customer"
                open={openMenu === "head:customer"}
                onToggle={() => setOpenMenu(openMenu === "head:customer" ? null : "head:customer")}
                active={sort.key === "customer" || sort.key === "customerTop"}
              >
                <MenuButton onClick={() => { setSort({ key: "customer", dir: 1 }); setOpenMenu(null); }}>
                  Sort A → Z
                </MenuButton>
                <MenuButton onClick={() => { setSort({ key: "customer", dir: -1 }); setOpenMenu(null); }}>
                  Sort Z → A
                </MenuButton>
                <MenuButton onClick={() => { setSort({ key: "customerTop", dir: 1 }); setOpenMenu(null); }}>
                  Top accounts first
                </MenuButton>
                {(sort.key === "customer" || sort.key === "customerTop") && (
                  <MenuButton onClick={() => { setSort({ key: null, dir: 1 }); setOpenMenu(null); }}>
                    Clear sort
                  </MenuButton>
                )}
              </SortableTh>
              <SortableTh
                label="Received"
                colKey="received"
                open={openMenu === "head:received"}
                onToggle={() => setOpenMenu(openMenu === "head:received" ? null : "head:received")}
                active={sort.key === "received"}
              >
                <MenuButton onClick={() => { setSort({ key: "received", dir: 1 }); setOpenMenu(null); }}>
                  Oldest first
                </MenuButton>
                <MenuButton onClick={() => { setSort({ key: "received", dir: -1 }); setOpenMenu(null); }}>
                  Newest first
                </MenuButton>
                {sort.key === "received" && (
                  <MenuButton onClick={() => { setSort({ key: null, dir: 1 }); setOpenMenu(null); }}>
                    Clear sort
                  </MenuButton>
                )}
              </SortableTh>
              <SortableTh
                label="Delivery"
                colKey="delivery"
                open={openMenu === "head:delivery"}
                onToggle={() => setOpenMenu(openMenu === "head:delivery" ? null : "head:delivery")}
                active={sort.key === "delivery"}
              >
                <MenuButton onClick={() => { setSort({ key: "delivery", dir: 1 }); setOpenMenu(null); }}>
                  Oldest first
                </MenuButton>
                <MenuButton onClick={() => { setSort({ key: "delivery", dir: -1 }); setOpenMenu(null); }}>
                  Newest first
                </MenuButton>
                {sort.key === "delivery" && (
                  <MenuButton onClick={() => { setSort({ key: null, dir: 1 }); setOpenMenu(null); }}>
                    Clear sort
                  </MenuButton>
                )}
              </SortableTh>
              <SortableTh
                label="SKU"
                colKey="sku"
                open={openMenu === "head:sku"}
                onToggle={() => setOpenMenu(openMenu === "head:sku" ? null : "head:sku")}
                active={sort.key === "sku"}
              >
                <MenuButton onClick={() => { setSort({ key: "sku", dir: 1 }); setOpenMenu(null); }}>
                  Low → High
                </MenuButton>
                <MenuButton onClick={() => { setSort({ key: "sku", dir: -1 }); setOpenMenu(null); }}>
                  High → Low
                </MenuButton>
                {sort.key === "sku" && (
                  <MenuButton onClick={() => { setSort({ key: null, dir: 1 }); setOpenMenu(null); }}>
                    Clear sort
                  </MenuButton>
                )}
              </SortableTh>
              <FilterTh
                label="Ordered via"
                open={openMenu === "head:orderedVia"}
                onToggle={() => setOpenMenu(openMenu === "head:orderedVia" ? null : "head:orderedVia")}
                active={filter.orderedVia.size > 0}
              >
                {ORDERED_VIA_CODES.map((code) => (
                  <FilterCheckbox
                    key={code}
                    label={ORDERED_VIA_LABELS[code]}
                    checked={filter.orderedVia.has(code)}
                    onChange={() => toggleFilter("orderedVia", code)}
                  />
                ))}
                <MenuButton onClick={() => { setFilter((f) => ({ ...f, orderedVia: new Set() })); setOpenMenu(null); }}>
                  Clear filter
                </MenuButton>
              </FilterTh>
              <FilterTh
                label="Order status"
                open={openMenu === "head:status"}
                onToggle={() => setOpenMenu(openMenu === "head:status" ? null : "head:status")}
                active={filter.status.size > 0}
              >
                {STATUS_CODES.map((code) => (
                  <FilterCheckbox
                    key={code}
                    label={STATUS_LABELS[code]}
                    checked={filter.status.has(code)}
                    onChange={() => toggleFilter("status", code)}
                  />
                ))}
                <MenuButton onClick={() => { setFilter((f) => ({ ...f, status: new Set() })); setOpenMenu(null); }}>
                  Clear filter
                </MenuButton>
              </FilterTh>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr
                key={o.id}
                onClick={() => openDealCard(o.id)}
                className="cursor-pointer border-t border-black/[0.06] transition hover:bg-brand/[0.03]"
              >
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] font-semibold text-brand-deep">
                  {o.orderNumber}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">{o.customerName}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{o.receivedAt}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{o.deliveryAt ?? "—"}</td>
                <td className="px-3 py-2.5 text-center text-ink-muted">{o.skuCount}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">
                  {ORDERED_VIA_LABELS[o.orderedVia]}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[o.status.code]}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {o.status.label}
                  </span>
                </td>
                <td className="relative px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="relative inline-block">
                    <button
                      type="button"
                      aria-label="More actions"
                      onClick={() => setOpenMenu(openMenu === `row:${o.id}` ? null : `row:${o.id}`)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-ink-muted transition hover:bg-black/[0.06] hover:text-ink"
                    >
                      <MoreVertical size={15} />
                    </button>
                    {openMenu === `row:${o.id}` && (
                      <div
                        className="absolute right-0 top-full z-40 mt-1.5 flex min-w-[132px] flex-col gap-0.5 rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <RowMenuButton
                          icon={<Eye size={13} />}
                          label="View"
                          onClick={() => {
                            setOpenMenu(null);
                            openDealCard(o.id);
                          }}
                        />
                        <RowMenuButton
                          icon={<Send size={13} />}
                          label="Send"
                          onClick={() => {
                            setOpenMenu(null);
                            showToast("Sent to colleague (mock)");
                          }}
                        />
                        <RowMenuButton
                          icon={<Printer size={13} />}
                          label="Print"
                          onClick={() => {
                            setOpenMenu(null);
                            showToast("Deal order sent to printer (mock)");
                          }}
                        />
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-ink-muted">
                  No orders match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lg">
          <Check size={15} className="text-success" />
          {toast}
        </div>
      )}
    </section>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap bg-brand/[0.03] px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-ink-muted/70">
      {children}
    </th>
  );
}

function HeaderControlShell({
  label,
  icon,
  active,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <th className="relative whitespace-nowrap bg-brand/[0.03] px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-ink-muted/70">
      <span className="inline-flex items-center gap-1.5">
        {label}
        <span className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label={`${label} options`}
            onClick={onToggle}
            className={`grid h-5 w-5 place-items-center rounded-md transition ${
              active ? "bg-brand/10 text-brand" : "text-ink-muted/60 hover:bg-black/[0.06] hover:text-ink"
            }`}
          >
            {icon}
          </button>
          {open && (
            <div
              className="absolute left-0 top-full z-40 mt-1.5 flex min-w-[170px] flex-col gap-0.5 rounded-xl border border-black/[0.08] bg-white p-1.5 normal-case tracking-normal text-ink shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </div>
          )}
        </span>
      </span>
    </th>
  );
}

function SortableTh({
  label,
  open,
  onToggle,
  active,
  children,
}: {
  label: string;
  colKey: SortKey;
  open: boolean;
  onToggle: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <HeaderControlShell
      label={label}
      icon={<ArrowDownUp size={11} />}
      active={active}
      open={open}
      onToggle={onToggle}
    >
      {children}
    </HeaderControlShell>
  );
}

function FilterTh({
  label,
  open,
  onToggle,
  active,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <HeaderControlShell
      label={label}
      icon={<Filter size={11} />}
      active={active}
      open={open}
      onToggle={onToggle}
    >
      {children}
    </HeaderControlShell>
  );
}

function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-ink transition hover:bg-brand/[0.06] hover:text-brand-deep"
    >
      {children}
    </button>
  );
}

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-brand/[0.06]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-brand"
      />
      {label}
    </label>
  );
}

function RowMenuButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-ink transition hover:bg-brand/[0.06] hover:text-brand-deep"
    >
      {icon}
      {label}
    </button>
  );
}
