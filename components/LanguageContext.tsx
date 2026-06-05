"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ru" | "uz";
export type Theme = "dark" | "light";

type AppPreferences = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const LangContext = createContext<AppPreferences>({
  lang: "ru",
  setLang: () => {},
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
});

const LANG_KEY = "gologramma-lang";
const THEME_KEY = "gologramma-theme";

function isLang(value: string | null): value is Lang {
  return value === "ru" || value === "uz";
}

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light";
}

function initialLang(): Lang {
  if (typeof window === "undefined") return "ru";
  const stored = localStorage.getItem(LANG_KEY);
  return isLang(stored) ? stored : "ru";
}

function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(THEME_KEY);
  return isTheme(stored) ? stored : "dark";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => current === "dark" ? "light" : "dark");

  return (
    <LangContext.Provider value={{ lang, setLang, theme, setTheme, toggleTheme }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() { return useContext(LangContext); }
