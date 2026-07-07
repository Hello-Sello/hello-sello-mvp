// Resend transport for lifecycle emails (SET-03). Deno-ONLY: this is the single place
// the Resend key is read, and it is read ONLY from the edge secret via Deno.env — never a
// hardcoded literal, and never a browser-exposed public env var (T-13-05-I). Resend
// publishes no Deno SDK, so we POST the REST API with the built-in fetch (no new package
// surface). The sending domain (hello-sello.com) is already verified for the existing
// auth SMTP path (Assumption A1).

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// The verified from-address. Matches the domain already verified for auth email (A1).
const FROM_ADDRESS = "Hello Sello <noreply@hello-sello.com>";

// POST one email to Resend. Fail-soft: a missing key or a non-2xx response returns
// { ok: false } rather than throwing, so the caller (and the fire-and-forget action in
// 13-11) never surfaces a transport error as an application failure.
export async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    // No edge secret configured (e.g. local without the key) — skip, do not throw.
    console.warn("sendViaResend: RESEND_API_KEY not set — skipping send");
    return { ok: false };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });

  return { ok: res.ok };
}
