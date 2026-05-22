# Marcel meeting — 2026-05-16

**Attendees:** team + Marcel Riggs

---

## Executive Summary

**AI automation for chat (Sella) finalized:** Team and Marcel Riggs agreed that Sella will proactively suggest responses in person-to-person chats; users can manually edit/send suggestions initially, with an option to enable "auto-fill" once trust is established.

**Instant translation feature confirmed:** The system will support instant chat translation (e.g., receive Spanish, reply in Danish) using local models to save tokens, specifically to facilitate global trade for users feeling "unsafe" in foreign languages.

**Product architecture for "Relationship Pages" and "Deal Rooms" defined:**

- **Relationship Page:** Central view where all colleagues in Company A can see all non-private deals with Company B.
- **Deal Room:** A full-page, floating workspace containing product baskets and artifacts, accessible to both companies and invited external experts.

**16-point Connection Matrix developed:** Team and Marcel Riggs mapped 16 logic states for user interactions based on whether persons/companies are on Hello Sello; critical decision made to allow "unverified deals" (sent via email/PDF link) so new users aren't blocked by company verification delays.

**Privacy controls for C-suite:** Profiles for CEOs and GVPs will be private by default or hidden from public search to prevent inbox spam, requiring direct invitations or specific email addresses for external contact.

**New Technical Integration:** Marcel Riggs is evaluating ZapMem for a temporal memory layer to track context changes over time (e.g., a user moving from Berlin to Munich) while ensuring data remains in the EU.

---

## Full Summary

### Sella AI Assistant Capabilities and Chat Integration

The team aims to make Sella a proactive tool that handles daily tasks for managers, ensuring the AI's impact is noticeable in daily conversations.

- Sella will have the ability to automatically reply to simple questions in person-to-person chats.
- A proactive feature will be implemented, similar to the deal card method, where Sella suggests responses that the user can approve, edit, or reject before sending.
- The "Ask Myself" concept was introduced to allow users to send an AI-driven resume or product tour, effectively allowing the AI to represent the user to investors or clients.
- Instant translation is prioritized as a key feature for global trade within the chat section.
- Team emphasized using local models that users can download to handle basic translations without consuming tokens.
- The system will support cross-language communication, such as receiving a message in Spanish and replying in Danish, to simplify international deals.

### Technical Infrastructure and AI Memory Layers

Marcel Riggs proposed moving from Memzero to ZapMem for the AI agent memory layer to address specific context issues.

- Memzero was found to have drawbacks regarding time tracking, as it fails to maintain temporal context (e.g., updating a user's location without remembering they moved).
- ZapMem includes a temporal component that allows the system to track changes over time.
- A critical investigation is required to ensure data stays within the EU or in the company's own database before final adoption, as data residency is a primary security concern.
- **Note:** ZapMem is under evaluation, not yet chosen.

### Deal Workspace and Relationship Management

The relationship page is being designed as the "heart" of the platform to centralize deal information between entities.

- All employees in Company A will be able to see all deals associated with Company B, and vice versa.
- Specific deals or groups can be set to "private" or "confidential" to restrict visibility.
- The workspace will integrate several UI components, including a "product basket" in the top right, deal cards styled like Pokémon cards, and a full-page "deal room."

### Connectivity Matrix and User Access Rules

The team defined a 16-case matrix to determine how communication and deal-making function when one or both parties are not yet connected or on the platform.

- If both companies and users are connected, they receive full access to deal rooms, price lists, and relationship pages.
- When companies are not connected but users are, the system will allow "unverified deals" which appear as tables in the chat with prompts to connect the companies.
- For users outside the Hello Sello platform, deals will be sent via email as a table with a temporary link to a deal room, with an option to export the deal as a PDF.
- Connection logic will prioritize user experience and privacy for high-level executives.
- An "auto-acceptance" rule will be implemented: if a user picks up an offer or order from an unconnected contact, the two individuals are automatically connected in the system.
- The system will allow companies to designate "publicly visible" staff, such as sales teams, while allowing CEOs and GVPs to keep their profiles private to avoid unsolicited messages.

### Team Expansion and Growth

- A new team member, **Victor**, is confirmed to join the project.
- Team noted that with Victor joining, the team will have "four brains operating at full scale," significantly increasing documentation speed and development capacity.
- The team is also exploring potential B2B contacts through a connection at Amazon to expand the platform's reach into new sectors beyond medical cannabis.

---

## Status

Captured 2026-05-18. To be integrated into Layer docs + DECISIONS.md in a subsequent session.
