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
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";

export default function Home() {
  const [activeTab, setActiveTab] = useState(0);
  const { lang, setLang } = useLang();

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
      default: return <Equipment />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }} className="px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #00E5FF, #9C27B0)' }}>
              <span className="text-white text-sm font-bold">H</span>
            </div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--accent-cyan)' }}>
              {t.appTitle[lang]}
            </h1>
            {/* Extension badge */}
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: '#0D1F38', border: '1px solid #00E5FF33', color: '#90A4AE' }}
              title={lang === 'ru' ? 'Папка: C:\\Users\\Genius\\hologram-pdf-extension' : 'Papka: C:\\Users\\Genius\\hologram-pdf-extension'}
            >
              <span>📄</span>
              <span style={{ color: '#00E5FF' }}>
                {lang === 'ru' ? 'PDF-расширение' : 'PDF kengaytma'}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#546E7A' }}>
                chrome://extensions
              </span>
            </div>

            {/* Language switcher */}
            <div className="flex gap-1 ml-auto sm:ml-2">
              <button
                onClick={() => setLang("ru")}
                style={{
                  background: lang === "ru" ? '#00E5FF22' : 'transparent',
                  border: `1px solid ${lang === "ru" ? '#00E5FF' : '#1E3A5F'}`,
                  color: lang === "ru" ? '#00E5FF' : '#90A4AE',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                RU
              </button>
              <button
                onClick={() => setLang("uz")}
                style={{
                  background: lang === "uz" ? '#00E5FF22' : 'transparent',
                  border: `1px solid ${lang === "uz" ? '#00E5FF' : '#1E3A5F'}`,
                  color: lang === "uz" ? '#00E5FF' : '#90A4AE',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                UZ
              </button>
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
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? "border-[#00E5FF] text-[#00E5FF]"
                    : "border-transparent hover:text-[#E8EAF6]"
                }`}
                style={{
                  color: activeTab === tab.id ? '#00E5FF' : 'var(--text-secondary)',
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
