"use client";

import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { getMyBasket } from "./supabase/reads";
import type { BasketView } from "./types";

interface BasketCtx {
  view: BasketView;
  refresh: () => Promise<void>;
  open: boolean;
  setOpen: (b: boolean) => void;
}

const Ctx = createContext<BasketCtx | null>(null);

const EMPTY: BasketView = { groups: [], totalLineCount: 0 };

export function BasketProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<BasketView>(EMPTY);
  const [open, setOpen] = useState(false);

  const refresh = useCallback((): Promise<void> => {
    return getMyBasket()
      .then(setView)
      .catch(() => setView(EMPTY)); // signed-out / no company → empty cart, never throws into the shell
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ view, refresh, open, setOpen }}>{children}</Ctx.Provider>;
}

export function useBasket(): BasketCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBasket must be used within BasketProvider");
  return c;
}
