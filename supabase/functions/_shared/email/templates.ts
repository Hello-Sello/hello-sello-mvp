// Lifecycle email templates (SET-03). PURE and Deno-FREE by contract: no environment
// reads, no network I/O, no runtime globals. This module is imported BOTH by the
// send-lifecycle-email edge function (Deno) AND by the 13-01 vitest unit test under
// node — so anything runtime-specific here would break the node import. Keep it a pure
// string transform, mirroring the committed-string discipline of _shared/sella/prompts.ts.
//
// Each of the 7 events renders a shared layout wrapper carrying EXACTLY ONE primary CTA
// anchor (D-17). Interpolated values (reason / name / company) come from untrusted data
// and are HTML-escaped before embedding (T-13-05-T injection guard). The layout footer
// carries no link, so the one-CTA invariant holds — these are transactional, always-on
// messages with no opt-out (D-16), so there is no unsubscribe anchor.

export type LifecycleEvent =
  | "verification.approved"
  | "verification.rejected"
  | "join.requested"
  | "join.approved"
  | "join.rejected"
  | "welcome"
  | "membership.removed";

// Default app base for CTA links. The edge function may override via vars.appUrl; this
// keeps the module pure (no env read) while letting the caller point at a real origin.
const DEFAULT_APP_URL = "https://hello-sello.com";

// Escape untrusted interpolated values before embedding them in HTML. Templates build
// strings only (no eval), so escaping the interpolated vars fully closes the injection
// vector for reason / name / company.
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A rendered section: the copy + the single call-to-action. `intro`/`body`/`heading` may
// already contain escaped interpolations, so the layout embeds them verbatim (it must not
// double-escape). Only the fixed `ctaLabel` is escaped inside the layout as belt-and-braces.
interface Section {
  subject: string;
  heading: string;
  intro: string;
  body?: string;
  ctaLabel: string;
  ctaHref: string;
}

// Shared layout wrapper: header + heading + intro + optional body + ONE CTA button +
// plain-text footer (no anchor). Inline styles because email clients strip <style>.
function layout(section: Section): string {
  const bodyBlock = section.body
    ? `                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${section.body}</p>\n`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;text-align:left;">
            <tr>
              <td style="font-size:18px;font-weight:600;color:#18181b;padding-bottom:8px;">Hello Sello</td>
            </tr>
            <tr>
              <td>
                <h1 style="margin:16px 0 8px;font-size:20px;line-height:1.4;color:#18181b;">${section.heading}</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${section.intro}</p>
${bodyBlock}                <p style="margin:24px 0;">
                  <a href="${section.ctaHref}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">${escapeHtml(section.ctaLabel)}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.5;color:#a1a1aa;">
                You are receiving this because of activity on your Hello Sello account. This is a transactional message about your account, not marketing.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Build the per-event section. All copy is Claude's discretion (D-17); the load-bearing
// contract is: a subject, one CTA, and — where relevant — the escaped `reason`.
function sectionFor(event: LifecycleEvent, vars: Record<string, unknown>): Section {
  const appUrl = typeof vars.appUrl === "string" && vars.appUrl ? vars.appUrl : DEFAULT_APP_URL;
  const name = vars.name ? escapeHtml(vars.name) : null;
  const company = vars.company_name ? escapeHtml(vars.company_name) : null;
  const reason = vars.reason ? escapeHtml(vars.reason) : null;
  const greeting = name ? `Hi ${name},` : "Hi there,";
  const companyLabel = company ?? "your company";
  const theCompanyLabel = company ?? "the company";

  switch (event) {
    case "verification.approved":
      return {
        subject: "Your company is verified on Hello Sello",
        heading: "You are verified",
        intro: `${greeting} good news — ${companyLabel} has been verified on Hello Sello. Your catalogue can now go live and buyers can discover and connect with you.`,
        ctaLabel: "Go to your dashboard",
        ctaHref: `${appUrl}/home`,
      };

    case "verification.rejected":
      return {
        subject: "Your Hello Sello verification needs another look",
        heading: "We could not verify your company yet",
        intro: `${greeting} we reviewed ${companyLabel} but were not able to verify it this time.`,
        body: reason
          ? `Reason: ${reason}`
          : "Please review your company details and licence documents, then resubmit.",
        ctaLabel: "Review and resubmit",
        ctaHref: `${appUrl}/onboarding`,
      };

    case "join.requested":
      return {
        subject: "Someone asked to join your company on Hello Sello",
        heading: "New request to join your company",
        intro: `${name ?? "Someone"} has asked to join ${companyLabel} on Hello Sello. Review the request and approve or decline it from your team settings.`,
        ctaLabel: "Review the request",
        ctaHref: `${appUrl}/settings/organization/team`,
      };

    case "join.approved":
      return {
        subject: "You're in — your Hello Sello request was approved",
        heading: "Your request was approved",
        intro: `${greeting} you have been added to ${theCompanyLabel} on Hello Sello and now have access to its workspace.`,
        ctaLabel: "Go to your dashboard",
        ctaHref: `${appUrl}/home`,
      };

    case "join.rejected":
      return {
        subject: "An update on your Hello Sello join request",
        heading: "Your join request was not approved",
        intro: `${greeting} your request to join ${theCompanyLabel} was not approved this time.`,
        body: reason
          ? `Reason: ${reason}`
          : "You can explore other companies on Hello Sello or reach out to them directly.",
        ctaLabel: "Explore companies",
        ctaHref: `${appUrl}/discover`,
      };

    case "welcome":
      return {
        subject: "Welcome to Hello Sello",
        heading: "Welcome to Hello Sello",
        intro: company
          ? `${greeting} ${company} is set up and ready. Complete your profile and catalogue to start connecting with buyers and sellers.`
          : `${greeting} your account is ready. Complete your profile and catalogue to start connecting with buyers and sellers.`,
        ctaLabel: "Get started",
        ctaHref: `${appUrl}/home`,
      };

    case "membership.removed":
      return {
        subject: "Your access to a company on Hello Sello has changed",
        heading: `You have been removed from ${companyLabel}`,
        intro: `${greeting} your access to ${theCompanyLabel} on Hello Sello has been removed. You can still sign in to your own account. If you think this was a mistake, please contact your company administrator.`,
        ctaLabel: "Sign in",
        ctaHref: `${appUrl}/login`,
      };

    default: {
      // Exhaustiveness guard: a new LifecycleEvent without a case is a compile error.
      const unreached: never = event;
      throw new Error(`Unknown lifecycle event: ${String(unreached)}`);
    }
  }
}

// Render a lifecycle email for `event` into a subject + a one-CTA HTML body.
export function renderTemplate(
  event: LifecycleEvent,
  vars: Record<string, unknown>,
): { subject: string; html: string } {
  const section = sectionFor(event, vars);
  return { subject: section.subject, html: layout(section) };
}
