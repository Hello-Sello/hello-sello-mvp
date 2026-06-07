import { ConnectSubNav } from "@/modules/connect";

/**
 * Connect surface layout: the sub-nav (panel 2) beside the active tab's
 * content. The global shell (rail + top bar) comes from the root layout; this
 * only adds Connect's internal two-column frame. Server component - the sub-nav
 * owns its own client-side active-tab state.
 */
export default function ConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full gap-3">
      <ConnectSubNav />
      <section className="flex min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
