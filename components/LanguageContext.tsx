"use client";
import { createContext, useContext, useState, ReactNode } from "react";

type Lang = "ru" | "uz";
const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "ru", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ru");
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() { return useContext(LangContext); }
