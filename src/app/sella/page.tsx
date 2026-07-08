import type { Metadata } from "next";
import { SellaDashboard } from "./SellaDashboard";

export const metadata: Metadata = { title: "Sella — Home" };

// Standalone preview of the Sella dashboard (same component the real /home uses).
export default function SellaPreview() {
  return <SellaDashboard />;
}
