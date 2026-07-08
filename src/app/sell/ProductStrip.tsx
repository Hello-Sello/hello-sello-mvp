"use client";

/**
 * The Batches allocator's product photo-tile strip (Sell surface, DEV-76).
 * Each tile shows the product's real first Present photo; clicking a tile
 * filters AllocationTable to that product; clicking the same tile again
 * clears back to "all products" (matches `.jar`/`.jar.sel` in the prototype).
 *
 * Fallback for a product with no cover photo mirrors ProductCard.tsx's own
 * placeholder convention exactly - a tinted tile with centered cultivar/name
 * text - rather than inventing a gradient-by-hue style: real products carry
 * no "hue" field (that was prototype-only mock data).
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
/** Build a public shop-media URL from a stored path (mirrors ProductCard.tsx's builder). */
const mediaUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}`;

export type ProductStripItem = {
  id: string;
  name: string;
  cultivar: string | null;
  coverImagePath: string | null;
};

export function ProductStrip({
  products,
  selectedId,
  onSelect,
}: {
  products: ProductStripItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (products.length === 0) return null;

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1" data-testid="product-strip">
      {products.map((p) => {
        const selected = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            title="Click to filter the table — click again for all products"
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : p.id)}
            className={`flex shrink-0 flex-col items-center gap-1 rounded-2xl border bg-white p-1 pb-1.5 shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105 ${
              selected ? "w-[104px] border-brand ring-2 ring-brand/40" : "w-[72px] border-ink/10"
            }`}
          >
            <span
              className={`relative aspect-square w-full overflow-hidden rounded-xl ${
                p.coverImagePath ? "" : "bg-brand-soft/40"
              }`}
            >
              {p.coverImagePath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaUrl(p.coverImagePath)}
                  alt={p.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] font-semibold text-brand-deep/70">
                  {p.name}
                </span>
              )}
            </span>
            {selected && (
              <span className="w-full text-center">
                <b className="block truncate text-[10.5px] font-bold text-brand-deep">{p.name}</b>
                {p.cultivar && (
                  <small className="block truncate text-[9px] font-semibold text-ink-muted">
                    {p.cultivar}
                  </small>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
