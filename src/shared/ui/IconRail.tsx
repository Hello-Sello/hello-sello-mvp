"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { User, LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { SURFACES } from "./surfaces";
import { NavItem } from "./NavItem";
import { Wordmark } from "./Wordmark";

/**
 * The global surface nav (panel 1). A light glass capsule that floats with a
 * margin: Hello Sello logo at the top, the 7 surface pills in the middle, the
 * user photo at the bottom. Client component only because it reads the route
 * to highlight the active surface.
 */
export function IconRail() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

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

      {/* user avatar slot (placeholder image) — click to open the account menu */}
      <div className="relative mt-auto flex justify-center pt-3">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-ink/40 shadow-sm ring-2 ring-white transition hover:text-ink/70"
          title="Account"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <User size={18} strokeWidth={1.75} />
        </button>

        {menuOpen && (
          <>
            {/* click-away backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="glass-strong absolute bottom-0 left-full z-20 ml-2 w-40 rounded-xl p-1">
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-white/60"
                >
                  <LogOut size={16} strokeWidth={1.75} />
                  Sign out
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
