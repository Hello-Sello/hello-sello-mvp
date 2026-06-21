/**
 * Deals module - client-side writes (3c).
 *
 * The workspace screen is a client component reading via the browser Supabase
 * client; ticks write through the SAME client so RLS applies and the UI stays
 * snappy. RLS `thing_all` (FOR ALL, can_access_workspace) lets a deal member
 * flip a Thing. Audit is NOT wired here - see the 3c plan's "Audit deferred"
 * note (no `thing.*` action code exists yet, and writeAudit is server-only).
 */
import { createClient } from "@/shared/db/client";
import type { StageCode, ThingStatus, ThingType, ThingView } from "../types";

/**
 * Flip one Thing between open and done. When marking done we stamp
 * `completed_at` + `completed_by_person_id` (the viewer); reopening clears both.
 * Returns the new status so the caller can reconcile optimistic UI. Throws on
 * an RLS or write error (the caller surfaces it).
 */
export async function toggleThingStatus(
  thingId: string,
  next: ThingStatus,
): Promise<ThingStatus> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("toggleThingStatus: no authenticated user");

  const done = next === "done";
  const { error } = await supabase
    .from("thing")
    .update({
      status: next,
      completed_at: done ? new Date().toISOString() : null,
      completed_by_person_id: done ? user.id : null,
      updated_by: user.id,
    })
    .eq("id", thingId);
  if (error) throw error;

  return next;
}

/**
 * Create a new Thing in a stage (3c, user-added). Defaults to a `task` (the
 * common case; the special `approval`/`document_upload` kinds are wired by 3d /
 * the upload task). The caller passes `sortOrder` (it knows the stage's current
 * count) so the new row lands at the end. RLS `thing_all` lets a member insert.
 * Returns the created row as a ThingView so the caller can append it in place.
 */
export async function createThing(args: {
  workspaceId: string;
  stageCode: StageCode;
  title: string;
  sortOrder: number;
  type?: ThingType;
}): Promise<ThingView> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("createThing: no authenticated user");

  const type: ThingType = args.type ?? "task";
  const { data, error } = await supabase
    .from("thing")
    .insert({
      deal_workspace_id: args.workspaceId,
      title: args.title.trim(),
      type,
      status: "open",
      stage_code: args.stageCode,
      sort_order: args.sortOrder,
      created_by: user.id,
    })
    .select("id, title, type, status, stage_code, sort_order")
    .single();
  if (error) throw error;

  return {
    id: data.id,
    title: data.title,
    type: data.type as ThingType,
    status: data.status as ThingStatus,
    stageCode: data.stage_code as StageCode,
    sortOrder: data.sort_order,
    // visibility/assignment default to unset on a plain create (extended in the
    // assignment-aware createThing below; Task 3).
    assigneePersonId: null,
    isPrivate: false,
    ownerCompanyId: null,
  };
}
