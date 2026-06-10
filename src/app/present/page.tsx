import { getMyShop } from "@/modules/catalog/shop";
import { SurfacePlaceholder } from "@/shared/ui/SurfacePlaceholder";
import { ShopView } from "./ShopView";

/**
 * Present — the seller's shop. Shows the logged-in company's storefront (their
 * own products + profile). Owner edit mode + the add-products drawer come next;
 * for now an empty shop shows the first-run upload prompt.
 */
export default async function PresentPage() {
  const shop = await getMyShop();
  if (!shop) {
    return (
      <SurfacePlaceholder
        title="Present"
        blurb="Finish company onboarding to set up your shop."
      />
    );
  }
  return <ShopView shop={shop} />;
}
