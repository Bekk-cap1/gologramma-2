"use client";

import { useState } from "react";
import { useLang } from "@/components/LanguageContext";
import { t } from "@/lib/translations";

const EQUIPMENT_DATA = [
  { emoji: "🔴", color: "#FF5252", specKey: "spec0" as const, nameKey: "eq0name" as const, descKey: "eq0desc" as const, whyKey: "eq0why" as const },
  { emoji: "🔷", color: "#00E5FF", specKey: "spec1" as const, nameKey: "eq1name" as const, descKey: "eq1desc" as const, whyKey: "eq1why" as const },
  { emoji: "🪞", color: "#90A4AE", specKey: "spec2" as const, nameKey: "eq2name" as const, descKey: "eq2desc" as const, whyKey: "eq2why" as const },
  { emoji: "🔭", color: "#69F0AE", specKey: "spec3" as const, nameKey: "eq3name" as const, descKey: "eq3desc" as const, whyKey: "eq3why" as const },
  { emoji: "🎲", color: "#FFB300", specKey: "spec4" as const, nameKey: "eq4name" as const, descKey: "eq4desc" as const, whyKey: "eq4why" as const },
  { emoji: "🎞️", color: "#9C27B0", specKey: "spec5" as const, nameKey: "eq5name" as const, descKey: "eq5desc" as const, whyKey: "eq5why" as const },
  { emoji: "🏗️", color: "#FF9800", specKey: "spec6" as const, nameKey: "eq6name" as const, descKey: "eq6desc" as const, whyKey: "eq6why" as const },
  { emoji: "🌑", color: "#546E7A", specKey: "spec7" as const, nameKey: "eq7name" as const, descKey: "eq7desc" as const, whyKey: "eq7why" as const },
];

export default function Equipment() {
  const { lang } = useLang();
  const [openWhy, setOpenWhy] = useState<number | null>(null);

  const toggleWhy = (index: number) => {
    setOpenWhy(openWhy === index ? null : index);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--accent-cyan)' }}>
          {t.equipTitle[lang]}
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          {t.equipSubtitle[lang]}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {EQUIPMENT_DATA.map((item, index) => (
          <div
            key={index}
            className="rounded-xl p-5 transition-all duration-300 cursor-default group"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = item.color;
              (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 20px ${item.color}33`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-color)';
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
            }}
          >
            <div className="flex items-start gap-3 mb-3">
              <div
                className="text-2xl w-12 h-12 flex items-center justify-center rounded-lg flex-shrink-0"
                style={{ background: `${item.color}22`, border: `1px solid ${item.color}44` }}
              >
                {item.emoji}
              </div>
              <div>
                <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                  {t[item.nameKey][lang]}
                </h3>
                <p className="text-xs mt-0.5 font-mono" style={{ color: item.color }}>
                  {t[item.specKey][lang]}
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
              {t[item.descKey][lang]}
            </p>

            {/* Expandable "Why" section */}
            <button
              onClick={() => toggleWhy(index)}
              className="w-full text-left text-xs font-semibold py-1.5 px-2 rounded transition-all"
              style={{
                color: item.color,
                background: openWhy === index ? `${item.color}18` : `${item.color}0A`,
                border: `1px solid ${item.color}33`,
              }}
            >
              {t.whyNeeded[lang]} {openWhy === index ? "▲" : "▼"}
            </button>

            {openWhy === index && (
              <div
                className="mt-2 p-3 rounded text-xs leading-relaxed"
                style={{
                  background: `${item.color}0D`,
                  border: `1px solid ${item.color}22`,
                  color: 'var(--text-secondary)',
                }}
              >
                {t[item.whyKey][lang]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Key requirements bar */}
      <div
        className="mt-8 rounded-xl p-5"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
      >
        <h3 className="font-semibold mb-3" style={{ color: 'var(--accent-amber)' }}>
          {t.keyReq[lang]}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            { key: "req1" as const, color: "#FF5252" },
            { key: "req2" as const, color: "#FF9800" },
            { key: "req3" as const, color: "#9C27B0" },
            { key: "req4" as const, color: "#69F0AE" },
          ]).map((req) => (
            <div
              key={req.key}
              className="text-sm rounded-lg px-3 py-2"
              style={{
                background: `${req.color}0D`,
                border: `1px solid ${req.color}33`,
                color: req.color,
              }}
            >
              {t[req.key][lang]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
