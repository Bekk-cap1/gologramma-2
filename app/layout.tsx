import type { Metadata } from "next";
import "./globals.css";
import { LangProvider } from "@/components/LanguageContext";

export const metadata: Metadata = {
  title: "Transmission Hologram — Интерактивный учебник",
  description: "Образовательное приложение о физике трансмиссионной голограммы",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-full flex flex-col" data-theme="dark" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
