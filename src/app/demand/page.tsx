import type { Metadata } from "next";
import { DemandPage } from "@/modules/demand";

export const metadata: Metadata = { title: "Demand — Hello Sello" };

/**
 * Demand (demo) — build a demand poll from the product list, send it to
 * contacts or share a link, and read the results. Deliberately NOT in
 * `surfaces.ts`: a hidden URL for demos until the surface is decided.
 */
export default function Demand() {
  return <DemandPage />;
}
