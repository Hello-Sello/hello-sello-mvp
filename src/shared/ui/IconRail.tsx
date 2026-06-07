"use client";

import { usePathname } from "next/navigation";
import { User } from "lucide-react";
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

  return (
    <aside className="glass m-3 mr-0 flex w-[84px] shrink-0 flex-col items-stretch gap-1 rounded-3xl p-2.5">
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

      {/* user photo slot - placeholder until the real avatar image lands */}
      <div className="mt-auto flex justify-center pt-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-ink/40 shadow-sm ring-2 ring-white"
          title="User photo"
        >
          <User size={18} strokeWidth={1.75} />
        </span>
      </div>
    </aside>
  );
}
