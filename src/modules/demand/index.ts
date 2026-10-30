/**
 * Public surface for the demand module — the Demand poll demo (hidden route
 * `/demand`, public poll page `/poll/<id>`). Client-only and browser-local for
 * now: no Supabase reads or writes, see `store.ts`.
 */
export { DemandPage } from "./components/DemandPage";
export { PollLanding } from "./components/PollLanding";
export type { DemandPoll, DemandProduct, DemandContact, DemandGroup, DemandResponse } from "./types";
