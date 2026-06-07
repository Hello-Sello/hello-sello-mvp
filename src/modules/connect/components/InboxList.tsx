import type { InboxItemView } from "@/modules/connect/types";
import { InboxRow } from "./InboxRow";

/**
 * The inbox list (panel 3 body): a scrollable column of rows for the active
 * lens, or an empty state. Presentational - it renders the items it's given
 * (already lens-filtered by InboxView) and forwards selection.
 */
export interface InboxListProps {
  items: InboxItemView[];
  selectedId: string | null;
  viewerPersonId: string;
  onSelect: (id: string) => void;
  /** sub-line under the empty state, lens-specific */
  emptyHint?: string;
}

export function InboxList({
  items,
  selectedId,
  viewerPersonId,
  onSelect,
  emptyHint,
}: InboxListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <p className="text-sm font-medium text-ink/60">You&apos;re all caught up</p>
        {emptyHint && <p className="mt-1 text-xs text-ink/40">{emptyHint}</p>}
      </div>
    );
  }

  return (
    <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
      {items.map((item) => (
        <li key={item.id}>
          <InboxRow
            item={item}
            isSelected={item.id === selectedId}
            viewerPersonId={viewerPersonId}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}
