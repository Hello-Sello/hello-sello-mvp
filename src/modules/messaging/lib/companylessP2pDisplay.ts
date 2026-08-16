/**
 * Resolve the conversation-list display fields for a COMPANY-LESS p2p thread — a
 * Discover person↔person DM (relationship_id NULL). Such a thread has no
 * relationship pair, so getConversations cannot derive the counterparty company
 * from a relationship; it resolves from the PERSON instead. When that person's
 * company isn't visible to the viewer (company_select only reveals companies you
 * are company-connected to), the subtitle is a neutral "Direct message" — never
 * the misleading "Unknown company" the relationship fallback produced.
 *
 * Anchored p2p / c2c / group threads keep their existing resolution — this is
 * only for the relationship_id === null case.
 */
export type CompanylessP2pDisplay = {
  companyId: string;
  companyName: string;
  subtitle: string;
  isExternal: boolean;
};

export function companylessP2pDisplay(input: {
  personName: string;
  personCompanyId: string | null;
  /** the person's company name, or null when it isn't visible to the viewer */
  personCompanyName: string | null;
  /** the viewer's company, or null when the viewer has no company */
  viewerCompanyId: string | null;
}): CompanylessP2pDisplay {
  const company = input.personCompanyName;
  return {
    companyId: input.personCompanyId ?? "",
    companyName: company ?? input.personName,
    subtitle: company ?? "Direct message",
    isExternal: input.personCompanyId != null && input.personCompanyId !== input.viewerCompanyId,
  };
}
