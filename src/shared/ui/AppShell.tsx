import { TopBar } from "./TopBar";
import { IconRail } from "./IconRail";

/**
 * The frame every page sits inside: a full-height dark rail down the left, and
 * a content column (top bar + page) filling the rest. Composed in the root
 * layout, so all routes inherit it. The pink glass background lives on <body>.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <IconRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-auto p-3">{children}</main>
      </div>
    </div>
  );
}
