"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ru" | "uz" | "en";
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
  return value === "ru" || value === "uz" || value === "en";
}

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ru");
  const [theme, setTheme] = useState<Theme>("dark");

  // Sync from localStorage only after mount to avoid SSR/client hydration mismatch
  useEffect(() => {
    const storedLang = localStorage.getItem(LANG_KEY);
    if (isLang(storedLang)) setLang(storedLang);
    const storedTheme = localStorage.getItem(THEME_KEY);
    if (isTheme(storedTheme)) setTheme(storedTheme);
  }, []);

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
