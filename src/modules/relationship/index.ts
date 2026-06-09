/**
 * Relationship module (screen ③) - public surface.
 *
 * The app (routes under `app/connect/`) composes the relationship page ONLY
 * through this barrel; nothing reaches into the module's internals. Grows as
 * 2e builds out:
 *   - Phase 1 adds RelationshipPage (the route mounts it)
 *   - Phase 2 adds the reads; Phase 5/6 the writes
 */
export { RelationshipPage } from "./components/RelationshipPage";

export type {
  RelationshipView,
  RelationshipCompany,
  NoteView,
  TermView,
  ArtifactView,
  DealSummaryView,
  LogEntry,
  RelationshipStats,
  NoteScope,
  TermTypeCode,
  ArtifactCategory,
  DealStatus,
} from "./types";
