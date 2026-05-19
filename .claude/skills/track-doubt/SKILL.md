---
name: track-doubt
description: Capture a design doubt about Hello Sello product documentation. Marks the spot in the relevant LAYER-*.md doc and creates a Linear issue framed as a clear question that needs a decision. Use this skill whenever a teammate is reading or reviewing any LAYER-*.md design document and an open question, doubt, unresolved design choice, or "we need to decide X" moment surfaces. Also trigger when the user says "track this", "open a doubt for", "add this as a question", "we need to come back to this", or invokes /track-doubt while reviewing the project docs. Strictly for capturing doubts — does not resolve them, list them, or do anything else.
---

# track-doubt

Capture a design doubt as (a) an inline marker in the relevant Hello Sello Layer doc, and (b) a Linear issue framed as a self-explanatory question needing a decision.

This skill is **strictly scoped:** it only creates new doubt entries. It does **not** resolve doubts, list existing ones, or edit doc content beyond the marker and a one-line entry in the doc's "Open Questions" section.

**Human-in-the-loop is non-negotiable:** never create the Linear issue or edit the doc until the user explicitly confirms the preview.

The reason for this strictness is twofold. First, doubts that aren't framed as clear standalone questions tend to accumulate as vague TODOs that nobody resolves — so we hold a high bar at creation. Second, Linear is a shared source of truth for the team and writes to it should always be intentional and reviewed.

---

## When to use this skill

Trigger when:
- The user is reading or reviewing a `LAYER-*.md` doc in the Hello Sello project and surfaces a doubt, open question, or unresolved design choice.
- The user explicitly says things like "track this doubt," "open a question on this," "we need to decide X," "add this as something to come back to."
- The user invokes `/track-doubt` directly, with or without a doubt in the same message.

Do **not** use this skill for:
- Resolving an existing doubt. Out of scope.
- Listing existing open doubts. Out of scope.
- General note-taking, todo capture, or anything that isn't a design question that needs a decision.

If the user asks for something out of scope, decline politely and explain the skill is strictly for capturing new doubts. Suggest they handle the other action directly.

---

## Workflow

Follow these steps in order. Do not skip the permission gate in Step 5.

### Step 1 — Capture the doubt

Take the user's input. If they invoked the skill with no doubt provided, ask them to describe it in one or two sentences.

### Step 2 — Identify the target doc and section

Determine which `LAYER-*.md` file the doubt relates to, and which specific section.

If unclear from context, ask the user:
- "Which Layer doc does this relate to?"
- "Which section of that doc?"

If the user can describe the topic but not the section number, search the doc to find the matching section. Use Grep or Read to locate it precisely.

Do not proceed without knowing both the file and the section.

### Step 3 — Draft the doubt as a self-explanatory question

This is the most important step. The Linear issue title and body must be standalone — a teammate reading it cold, without opening the doc, should immediately understand what's being asked.

**Title:** must be phrased as a question. Examples:
- "What content should appear on the back of the Deal Card?"
- "How does Sella distinguish casual chat from deal-forming chat?"
- "Should pharmacies be charged per active deal or per month?"

**Body (markdown):** keep it short — target ~50-100 words. Use Marcel's standard issue template (see DEV-37, DEV-38, DEV-40, DEV-41 for live examples).

Structure (Marcel's template — four labelled sections, each 1-2 sentences):

```markdown
What do we want to do?
[One sentence — the goal or outcome being defined.]

Problem:
[One or two sentences — the specific open question, including a section reference (e.g., "Layer 1 §4.2 says X is TBD").]

Proposed Solution and Why:
[One or two sentences — proposed direction with rationale. If unknown, write "TBD" and list the angles being considered.]

Additional Context:
[Optional — one sentence linking to related issues, prior decisions, or a layer doc. Can be left blank.]
```

Do NOT write a long multi-section essay. The team prefers tight, scannable issue bodies — DEV-37 and DEV-38 are ~50-70 words. If you find yourself writing more than ~100 words, you're overdoing it — cut.

If the user's input is too vague to frame as a clear question (e.g., "pricing is weird"), ask follow-up questions until the question is sharp. Never create a vague ticket — vague tickets become dead tickets.

### Step 4 — Suggest a Linear project

Hello Sello uses the **Development** team in Linear.

**Linear hierarchy in this workspace:**

```
Project labels (R&D / Connect / Sella / Authentication / Present / Sell / Buy / Trade)
       ↓
Projects (each project lives under one project label)
       ↓
Issues (each issue lives inside one project)
```

**Issues themselves do NOT get issue labels.** The team's existing issues (DEV-1, DEV-2, DEV-3, etc.) have empty label fields. The topic is carried by the **project assignment**, not by issue labels. **Do not assign Bug / Improvement / Feature or any other issue-level label.** This matches how the team works today.

**To pick the right project**, use the project-label areas below to find the topic, then pick the most specific project within that area:

| Area (project label) | Projects typically belonging here |
|---|---|
| Connect | Deals / Deal Card definition (structure & access), Chat, Relationship page (company-company), Flow to connect two companies, Thread instead of group chat, Sending offer with product basket and note, Requesting offer/pricelist, Sending connect request with "note" |
| Sella | Sella for sellers, Sella for buyers, Sella for CEOs, Sella for relationship/deal |
| Authentication | Company account setup, Creating Superadmin role, Invite Team, Portfolio setup, Email Verification, Sign in, Personal account setup, Signup via email, Business Card QR Code Generation |
| R&D | What context will SELLA use, Encrypted chat model, GDPR sister companies, LLM selection, Free and Premium plan, PRD, Architecture & System Design |
| Present | Shop setup, Upload and Link (photos/videos), COA Upload/Link, Basket from seller view, Basket from buyer view, Presentation Mode, Leverage LinkedIn Banner |
| Sell | Batch Allocation, Pricelist per customer overview, Batch upload by procurement team |
| Buy | Initial view for buyers |
| Trade | Define analysis page |

Pick the most specific project. If the doubt spans multiple areas, pick the primary one and note the cross-cutting nature in the issue body. If no existing project fits, propose creating a new one and surface this to the user — do **not** create the new project without permission.

**To verify projects live** before suggesting one, use:
- `mcp__224a1bd7-7c59-4cb2-a35c-35a4a6596f13__list_projects` — lists all projects with their project-label

### Step 5 — Show preview and ask for permission

**This is the permission gate. Do not skip it. Do not write anything to disk or Linear before this step is complete.**

Display to the user, clearly labeled with all three parts:

**A. Linear issue draft**
```
Team:    Development
Project: [proposed project name]
Labels:  (none — matches the team's existing issue format)

Title:   [the question]

Body:
[The short ~80-120 word body following the structure in Step 3.]
```

**B. Doc edit — marker placement**

Show the section heading where the marker will land, and the literal marker line that will be inserted. Use `[pending]` in the preview since the issue isn't created yet:

```
> **⚠️ OPEN [pending]** — one-line summary of the doubt
```

**C. Open Questions section — entry to append at the bottom of the doc**

Show the row that will be appended:

```
- **Section X.Y** — [question] — [pending Linear link]
```

Then ask the user explicitly:

> **Confirm to create the Linear issue and update the doc?**

User response handling:
- "Yes" / "Confirm" / "Go ahead" / "Proceed" → go to Step 6.
- "Change X to Y" / "Re-word the title" / "Use the Sella label instead" / etc. → revise the relevant piece(s) and re-show the **full** preview again. Loop until confirmed or cancelled.
- "Cancel" / "Skip" / "Forget it" → abort. Do not write anything to disk or Linear.

### Step 6 — Execute (only after explicit user confirmation)

Do these in order. Linear first, so we capture the issue ID for the doc edit.

**6a. Create the Linear issue** using:
```
mcp__224a1bd7-7c59-4cb2-a35c-35a4a6596f13__save_issue
```

Pass:
- `title`: the question
- `description`: the short body (markdown, ~80-120 words, matching team's existing issue format)
- `team`: "Development"
- `project`: the chosen project name
- (Do NOT pass a `labels` field — the team's issues are unlabeled. The project assignment carries the topic.)

Capture the returned issue ID (e.g., `DEV-5`) and URL from the tool response.

**6b. Edit the LAYER-*.md doc.**

Two edits:

1. **Insert the inline marker** at the relevant section. Use the Edit tool. The marker format:
   ```
   > **⚠️ OPEN [DEV-X]** — one-line summary
   ```
   Place it directly after the section heading, or at the most specific spot inside the section that the doubt relates to. Replace `DEV-X` with the actual issue ID.

2. **Append to the "Open Questions" section** at the bottom of the doc.
   - Search the doc for a heading containing "Open Questions" (case-insensitive). It may be numbered (e.g., "## 13. Open questions still to brainstorm") or unnumbered.
   - If a matching heading exists, append a new bullet at the end of that section.
   - If no matching heading exists, create a new `## Open Questions` section just before the closing footer of the doc (the line starting with `*End of Layer*` or similar). If there's no footer, append the new section at the very end.
   - Bullet format:
     ```
     - **Section X.Y** — [question] — [DEV-X](Linear URL)
     ```

**6c. Confirm to the user** in one line:
> Created [DEV-X](URL) and marked Section X.Y in `LAYER-*.md`.

---

## Hard rules (do not violate)

1. **Self-explanatory question.** The Linear title and body must read as a clear standalone question. If the input is too vague, ask follow-up questions. Never create a vague ticket.
2. **Permission gate before any write.** Never create the Linear issue or edit the doc until the user has explicitly confirmed the preview. If the user revises, re-show the full preview and re-ask.
3. **Strict scope.** This skill only creates new doubt entries. It does not resolve doubts, list doubts, or perform any other operation. Refuse politely if asked and suggest the user handle other actions directly.
4. **Order of writes.** Linear first (to capture the issue ID and URL), then doc edits (so they can reference the real ID, not `[pending]`).
5. **Atomicity on failure.** If the Linear issue creation succeeds but the doc edit fails, tell the user clearly which step succeeded and which failed, and surface the Linear URL so nothing is lost.

---

## Examples

### Example 1 — section reference provided up front

User: `/track-doubt In section 4.2 we don't know what the back of the deal card should contain.`

Claude:
1. Identifies `LAYER-1-USERS-AND-CORE-OBJECTS.md`, Section 4.2 (The Deal Card).
2. Drafts the title: "What content should appear on the back of the Deal Card (the flip side)?"
3. Drafts the body using Marcel's template:
   ```
   What do we want to do?
   Define the content of the back of the Deal Card (Sella's summary).

   Problem:
   Layer 1 §4.2 says the back is "Sella's summary of the deal" — content TBD. Plain-English summary, risk flags, past-deal comparison, predicted outcome, or some combination?

   Proposed Solution and Why:
   TBD — needs design exploration.

   Additional Context:
   Open question listed in Layer 1 §13.
   ```
4. Suggests project = "Deals / Deal Card definition (structure & access)".
5. Builds the preview (Linear draft + marker location + Open Questions row).
6. Asks: "Confirm to create the Linear issue and update the doc?"
7. On confirmation: creates the issue, edits the doc, replies with the Linear URL.

### Example 2 — doubt only, no section reference

User: `/track-doubt`
Claude: "What's the doubt?"
User: "We're not sure how Sella detects a casual chat vs a real deal forming."
Claude: "Which Layer doc and section does this relate to?"
User: "Layer 1, the section on deal birth from chat."
Claude: (finds Section 5.2 Path B) → builds preview with label = Sella, project = "Sella for relationship/deal" → asks for confirmation.

### Example 3 — vague input, must sharpen before creating

User: `/track-doubt Pricing is weird.`
Claude: "Before I create a ticket I want to sharpen this into a clear question. Which of these is closest, or is it something else?
- Should we use fixed-tier pricing or usage-based pricing?
- Should pharmacies be free for 6 months and then paid?
- Should pricing be different for sellers vs. buyers?"

Keep iterating until the question is sharp. **Do not create a vague ticket.**

### Example 4 — user wants to revise the preview

User: "Looks good but change the title to start with 'How' instead of 'What.'"
Claude: revises the title, re-shows the full preview (Linear draft + marker + Open Questions row), re-asks for confirmation.

### Example 5 — out of scope request

User: "Use this skill to close DEV-7 since we resolved it."
Claude: "This skill only tracks new doubts. To resolve DEV-7, please close it directly in Linear (or ask me to update it outside this skill). Want to track a new doubt instead?"

---

## Reference: Linear tools used

- `mcp__224a1bd7-7c59-4cb2-a35c-35a4a6596f13__save_issue` — creates Linear issues
- `mcp__224a1bd7-7c59-4cb2-a35c-35a4a6596f13__list_projects` — verifies project names exist before suggesting

The skill should only ever **read** existing projects and **create** issues. Do not edit or delete existing Linear content. **Do not assign issue labels** — the team's existing issues are unlabeled and the topic is carried by the project assignment.
