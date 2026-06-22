/**
 * Connect module - public surface.
 *
 * The app (routes under `app/connect/`) composes Connect ONLY through this
 * barrel; nothing reaches into the module's internals. Grows as 2a builds out
 * (InboxView lands here in step 10).
 */
export { InboxView } from "./components/InboxView";
export type { InboxItemView, LensKey, TeamMember } from "./types";
