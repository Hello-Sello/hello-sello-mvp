import { Check } from "lucide-react";
import { CTAButton } from "./CTAButton";

/**
 * Hero (one-screen landing, left column). Holds the ONLY <h1> on the page
 * (the e2e h1 contract), line 2 as the first <p> after it (the e2e subhead
 * contract), the audience paragraph, a three-item trust line, and the single
 * primary "Request access" CTA -> /signup (D-02) with the verified-only line
 * under it. No secondary in-page link: there is nothing below to scroll to.
 *
 * The headline is one text node ("SAFER BIGGER DEALS" - the e2e asserts the
 * exact text) set in the display face at a measure of ~6em, so each word takes
 * its own line and the three words stack like a poster.
 */
const TRUST = ["GDPR compliant", "Full privacy of data", "Company to company privacy"];

export function Hero() {
  return (
    <div className="flex flex-col justify-center">
      <h1 className="lp-display max-w-[6em] text-[2.9rem] font-extrabold leading-[0.93] tracking-[-0.035em] text-brand-deep sm:text-[3.5rem] xl:text-[4rem]">
        SAFER BIGGER DEALS
      </h1>

      <p className="lp-display mt-5 max-w-[24ch] text-[1.3rem] font-semibold leading-snug tracking-[-0.015em] text-ink sm:text-2xl">
        Close hundreds of B2B deals in one secured Chat
      </p>

      <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
        {"If you're a medical cannabis supplier, grower, pharmacy or wholesaler, this system is built for you. Private chats and confidential deals with your entire network. Buy and sell all products to all partners."}
      </p>

      <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium text-ink">
        {TRUST.map((label) => (
          <li key={label} className="flex items-center gap-1.5">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-brand/10 text-brand">
              <Check size={10} strokeWidth={3} aria-hidden />
            </span>
            {label}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col items-start gap-2.5">
        <CTAButton size="lg">Request access</CTAButton>
        <p className="max-w-[52ch] text-xs leading-relaxed text-ink-muted">
          Only verified companies (e.g. pharmacies and their partners). Apply for
          access and we verify your business before you onboard.
        </p>
      </div>
    </div>
  );
}
