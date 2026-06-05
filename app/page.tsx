"use client";

import { useState } from "react";
import Equipment from "@/components/tabs/Equipment";
import OpticalScheme from "@/components/tabs/OpticalScheme";
import Recording from "@/components/tabs/Recording";
import MathTab from "@/components/tabs/Math";
import Reconstruction from "@/components/tabs/Reconstruction";
import HologramPiece from "@/components/tabs/HologramPiece";
import Comparison from "@/components/tabs/Comparison";
import OpticalTable from "@/components/tabs/OpticalTable";
import ReconstructionSim from "@/components/tabs/ReconstructionSim";
import FractalCNN from "@/components/tabs/FractalCNN";
import FractalGenerator from "@/components/tabs/FractalGenerator";
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";

export default function Home() {
  const [activeTab, setActiveTab] = useState(0);
  const { lang, setLang, theme, setTheme } = useLang();
  const controls = {
    language: { ru: "Язык", uz: "Til" },
    theme: { ru: "Тема", uz: "Mavzu" },
    dark: { ru: "Тёмная", uz: "Qora" },
    light: { ru: "Светлая", uz: "Yorug'" },
  };

  const TABS = [
    { id: 0, label: t.tab0[lang] },
    { id: 1, label: t.tab1[lang] },
    { id: 2, label: t.tab2[lang] },
    { id: 3, label: t.tab3[lang] },
    { id: 4, label: t.tab4[lang] },
    { id: 5, label: t.tab5[lang] },
    { id: 6, label: t.tab6[lang] },
    { id: 7, label: t.tableTab[lang] },
    { id: 8, label: t.reconSimTab[lang] },
    { id: 9, label: t.fractalTab[lang] },
    { id: 10, label: t.fractalGenTab[lang] },
  ];

  const renderTab = () => {
    switch (activeTab) {
      case 0: return <Equipment />;
      case 1: return <OpticalScheme />;
      case 2: return <Recording />;
      case 3: return <MathTab />;
      case 4: return <Reconstruction />;
      case 5: return <HologramPiece />;
      case 6: return <Comparison />;
      case 7: return <OpticalTable />;
      case 8: return <ReconstructionSim />;
      case 9: return <FractalCNN />;
      case 10: return <FractalGenerator />;
      default: return <Equipment />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="app-header px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #00E5FF, #9C27B0)' }}>
              <span className="text-white text-sm font-bold">H</span>
            </div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--accent-cyan)' }}>
              {t.appTitle[lang]}
            </h1>
            {/* Extension badge */}
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--control-bg)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
              title={lang === 'ru' ? 'Папка: C:\\Users\\Genius\\hologram-pdf-extension' : 'Papka: C:\\Users\\Genius\\hologram-pdf-extension'}
            >
              <span>📄</span>
              <span style={{ color: 'var(--accent-cyan)' }}>
                {lang === 'ru' ? 'PDF-расширение' : 'PDF kengaytma'}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-secondary)' }}>
                chrome://extensions
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
              {/* Language switcher */}
              <div className="app-control-group" aria-label={controls.language[lang]}>
                <span className="app-control-label">{controls.language[lang]}</span>
                <button
                  type="button"
                  className="app-control-button"
                  data-active={lang === "ru"}
                  aria-pressed={lang === "ru"}
                  onClick={() => setLang("ru")}
                >
                  RU
                </button>
                <button
                  type="button"
                  className="app-control-button"
                  data-active={lang === "uz"}
                  aria-pressed={lang === "uz"}
                  onClick={() => setLang("uz")}
                >
                  UZ
                </button>
              </div>

              {/* Theme switcher */}
              <div className="app-control-group" aria-label={controls.theme[lang]}>
                <span className="app-control-label">{controls.theme[lang]}</span>
                <button
                  type="button"
                  className="app-control-button"
                  data-active={theme === "dark"}
                  aria-pressed={theme === "dark"}
                  onClick={() => setTheme("dark")}
                >
                  {controls.dark[lang]}
                </button>
                <button
                  type="button"
                  className="app-control-button"
                  data-active={theme === "light"}
                  aria-pressed={theme === "light"}
                  onClick={() => setTheme("light")}
                >
                  {controls.light[lang]}
                </button>
              </div>
            </div>

          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t.appSubtitle[lang]}
          </p>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }} className="sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex overflow-x-auto gap-0 scrollbar-hide">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2"
                style={{
                  borderColor: activeTab === tab.id ? 'var(--accent-cyan)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Tab Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {renderTab()}
      </main>

      {/* Footer */}
      <footer style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)' }} className="px-6 py-4 text-center">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t.appTitle[lang]} — {t.appSubtitle[lang]}
        </p>
      </footer>
    </div>
  );
}
