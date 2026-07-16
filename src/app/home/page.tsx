import { DashboardContent } from "../sella/SellaDashboard";

/**
 * Logged-in home. Renders the Sella dashboard INSIDE the app shell (sidebar +
 * top bar + navigation stay), so the app is fully usable. Content is an
 * illustrative dummy (design preview, no backend). The previous
 * onboarding/verification home lives in git history and can be restored when we
 * wire real data into this design.
 */
export default function HomePage() {
  return <DashboardContent />;
}
