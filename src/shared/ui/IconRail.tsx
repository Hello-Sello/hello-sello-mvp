"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { User, Building2, Settings, LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { SURFACES } from "./surfaces";
import { NavItem } from "./NavItem";
import { Wordmark } from "./Wordmark";
import { Avatar } from "./Avatar";
import { getAccountCard, type AccountCard } from "./account-card";

/**
 * The global surface nav (panel 1). A light glass capsule: Hello Sello logo at
 * the top, the 7 surface pills in the middle, and the account card at the bottom
 * — the avatar opens a popover with the person's QR business card + the links to
 * the account pages and sign-out.
 */
export function IconRail() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [card, setCard] = useState<AccountCard>(null);

  // Load the card once on mount (server action — keeps profile reads server-side).
  useEffect(() => {
    getAccountCard().then(setCard);
  }, []);

  return (
    <aside className="glass m-3 mr-0 flex w-[76px] shrink-0 flex-col items-stretch gap-1 rounded-3xl p-2.5">
      <div className="mb-3 mt-1 flex justify-center" title="Hello Sello">
        <Wordmark stacked />
      </div>

      <nav className="flex flex-col gap-1">
        {SURFACES.map((surface) => {
          const isActive =
            surface.state === "active" &&
            (pathname === surface.href ||
              pathname.startsWith(surface.href + "/"));
          return (
            <NavItem key={surface.key} surface={surface} isActive={isActive} />
          );
        })}
      </nav>

      {/* account card — avatar opens the QR business card + account links */}
      <div className="relative mt-auto flex justify-center pt-3">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="rounded-full ring-2 ring-white transition hover:opacity-90"
          title="Account"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {card ? (
            <Avatar url={card.avatarUrl} name={card.displayName} size={40} />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-ink/40 shadow-sm">
              <User size={18} strokeWidth={1.75} />
            </span>
          )}
        </button>

        {menuOpen && (
          <>
            {/* click-away backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="glass-strong absolute bottom-0 left-full z-20 ml-2 w-72 rounded-3xl p-5 text-center">
              {card && (
                <>
                  <div className="flex justify-center">
                    <Avatar url={card.avatarUrl} name={card.displayName} size={64} />
                  </div>
                  <h3 className="mt-3 text-base font-bold text-ink">{card.displayName}</h3>
                  {card.title && <p className="text-sm text-ink-muted">{card.title}</p>}
                  {card.companyName && (
                    <span className="mt-2 inline-block rounded-full border border-brand/40 px-3 py-0.5 text-xs font-semibold text-brand">
                      {card.companyName}
                    </span>
                  )}
                  {card.qrSvg && (
                    <>
                      <div
                        className="mx-auto mt-4 w-fit rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5 [&>svg]:h-[104px] [&>svg]:w-[104px]"
                        dangerouslySetInnerHTML={{ __html: card.qrSvg }}
                      />
                      <p className="mt-1.5 text-[10px] font-medium tracking-widest text-ink-muted">SCAN TO CONNECT</p>
                    </>
                  )}
                </>
              )}

              <div className="mt-4 space-y-1 border-t border-black/5 pt-3 text-left">
                <MenuLink href="/account?tab=profile" icon={User} label="My Profile" onClick={() => setMenuOpen(false)} />
                <MenuLink href="/account?tab=company" icon={Building2} label="Company Profile" onClick={() => setMenuOpen(false)} />
                <MenuLink href="/account?tab=settings" icon={Settings} label="Settings" onClick={() => setMenuOpen(false)} />
                <form action={signOut}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-brand transition hover:bg-black/[0.04]"
                  >
                    <LogOut size={16} strokeWidth={1.75} /> Sign out
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function MenuLink({ href, icon: Icon, label, onClick }: { href: string; icon: typeof User; label: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink transition hover:bg-black/[0.04]"
    >
      <Icon size={16} strokeWidth={1.75} /> {label}
    </Link>
  );
}
