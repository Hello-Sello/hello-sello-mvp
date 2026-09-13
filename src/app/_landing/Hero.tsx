import { Building2, Lock, ShieldCheck } from "lucide-react";
import { CTAButton } from "./CTAButton";

/**
 * Hero (one-screen landing, left column). Holds the ONLY <h1> on the page
 * (the e2e h1 contract), line 2 as the first <p> after it (the e2e subhead
 * contract), the audience paragraph, three trust badges, and the single
 * primary "Request access" CTA -> /signup (D-02) with the verified-only line
 * under it. No secondary in-page link: there is nothing below to scroll to.
 */
const BADGES = [
  { icon: ShieldCheck, label: "GDPR compliant" },
  { icon: Lock, label: "Full privacy of data" },
  { icon: Building2, label: "Company to company privacy" },
];

export function Hero() {
  return (
    <div className="flex flex-col justify-center text-center lg:text-left">
      <h1 className="text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl xl:text-6xl">
        <span className="bg-gradient-to-r from-brand to-brand-deep bg-clip-text text-transparent">
          SAFER BIGGER DEALS
        </span>
      </h1>

      <p className="mt-4 text-xl font-semibold text-ink sm:text-2xl">
        Close hundreds of B2B deals in one secured Chat
      </p>

      <p className="mx-auto mt-4 max-w-xl text-base text-ink-muted lg:mx-0">
        {"If you're a medical cannabis supplier, grower, pharmacy or wholesaler, this system is built for you. Private chats and confidential deals with your entire network. Buy and sell all products to all partners."}
      </p>

      <ul className="mt-5 flex flex-wrap justify-center gap-2 lg:justify-start">
        {BADGES.map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-ink"
          >
            <Icon size={14} className="text-brand" aria-hidden />
            {label}
          </li>
        ))}
      </ul>

      <div className="mt-7 flex flex-col items-center gap-3 lg:items-start">
        <CTAButton size="lg" withArrow>
          Request access
        </CTAButton>
        <p className="max-w-md text-xs text-ink-muted">
          Only verified companies (e.g. pharmacies and their partners). Apply for
          access and we verify your business before you onboard.
        </p>
      </div>
    </div>
  );
}
