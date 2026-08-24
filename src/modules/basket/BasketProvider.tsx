"use client";

import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { getMyBasket } from "./supabase/reads";
import { EMPTY_BASKET, type BasketView } from "./types";

interface BasketCtx {
  view: BasketView;
  refresh: () => Promise<void>;
  open: boolean;
  setOpen: (b: boolean) => void;
  /** Set when the read FAILED. Null while the basket is merely empty — the two
   * are different states and must never render the same way. */
  error: string | null;
}

const Ctx = createContext<BasketCtx | null>(null);

const READ_FAILED = "We couldn't load your basket.";

export function BasketProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<BasketView>(EMPTY_BASKET);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback((): Promise<void> => {
    // No classification happens here, deliberately. `getMyBasket()` returns an
    // empty basket for the two causes that legitimately mean "nothing to show"
    // (signed out, not yet onboarded) and throws for everything else, so every
    // throw reaching this catch is a real failure. The previous version caught
    // all of them and set EMPTY, which made a permission error, a dead
    // connection and a signed-out session look identical to the user and left
    // nothing in the log.
    return getMyBasket()
      .then((v) => {
        setView(v);
        setError(null);
      })
      .catch((e) => {
        console.error("basket: read failed", e);
        setView(EMPTY_BASKET);
        setError(READ_FAILED);
      });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ view, refresh, open, setOpen, error }}>{children}</Ctx.Provider>
  );
}

export function useBasket(): BasketCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBasket must be used within BasketProvider");
  return c;
}
