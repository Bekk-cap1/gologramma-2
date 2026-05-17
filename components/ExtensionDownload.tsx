"use client";

import { useState } from "react";
import { useLang } from "@/components/LanguageContext";

// ---------------------------------------------------------------------------
// Extension file contents embedded as module-level constants
// ---------------------------------------------------------------------------

const MANIFEST = `{
  "manifest_version": 3,
  "name": "Hologram Calculator — PDF Export",
  "description": "Экспорт расчётов transmission голограммы в PDF для диссертации",
  "version": "1.0.0",
  "permissions": ["activeTab", "storage", "scripting"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icon-16.svg",
      "48": "icon-48.svg",
      "128": "icon-128.svg"
    }
  },
  "content_scripts": [
    {
      "matches": ["http://localhost:3100/*", "https://*.vercel.app/*"],
      "js": ["content.js"],
      "run_at": "document_end"
    }
  ],
  "background": {
    "service_worker": "service-worker.js"
  },
  "icons": {
    "16": "icon-16.svg",
    "48": "icon-48.svg",
    "128": "icon-128.svg"
  }
}`;

const CONTENT_JS = `chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_HOLOGRAM_DATA') {
    const data = window.__HOLOGRAM_DATA__;
    sendResponse({ success: !!data, data: data || null });
    return true;
  }
});
`;

const SERVICE_WORKER = `chrome.runtime.onInstalled.addListener(() => {
  console.log('Hologram PDF Extension installed');
});
`;

const POPUP_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hologram PDF</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="logo">
        <img src="icon-48.svg" width="32" height="32" alt="icon">
        <div>
          <div class="title">Hologram PDF</div>
          <div class="subtitle">Экспорт расчётов</div>
        </div>
      </div>
    </div>

    <!-- Connection status -->
    <div class="status-bar" id="statusBar">
      <span id="statusIcon">⟳</span>
      <span id="statusText">Проверка подключения...</span>
    </div>

    <!-- Current parameters (shown when connected) -->
    <div class="params-section" id="paramsSection" style="display:none">
      <div class="section-title">Текущие параметры</div>
      <div class="params-grid">
        <div class="param-item"><span class="param-label">λ</span><span class="param-value" id="pLambda">—</span></div>
        <div class="param-item"><span class="param-label">θ</span><span class="param-value" id="pTheta">—</span></div>
        <div class="param-item"><span class="param-label">Δλ</span><span class="param-value" id="pDelta">—</span></div>
        <div class="param-item"><span class="param-label">d</span><span class="param-value" id="pD">—</span></div>
        <div class="param-item"><span class="param-label">N</span><span class="param-value" id="pN">—</span></div>
        <div class="param-item"><span class="param-label">Lc</span><span class="param-value" id="pLc">—</span></div>
        <div class="param-item"><span class="param-label">α</span><span class="param-value" id="pAlpha">—</span></div>
      </div>
    </div>

    <!-- PDF Settings -->
    <div class="settings-section">
      <div class="section-title">Включить в отчёт</div>
      <div class="checkboxes">
        <label class="checkbox-item"><input type="checkbox" id="chkParams" checked> Входные параметры</label>
        <label class="checkbox-item"><input type="checkbox" id="chkFormulas" checked> Формулы</label>
        <label class="checkbox-item"><input type="checkbox" id="chkSteps" checked> Пошаговый расчёт</label>
        <label class="checkbox-item"><input type="checkbox" id="chkTable" checked> Таблица результатов</label>
        <label class="checkbox-item"><input type="checkbox" id="chkTheory"> Теория (описание принципа)</label>
        <label class="checkbox-item"><input type="checkbox" id="chkComparison"> Сравнение Transmission vs Reflection</label>
      </div>
    </div>

    <!-- Author fields -->
    <div class="author-section">
      <input type="text" id="authorName" placeholder="Имя автора" class="text-input">
      <input type="text" id="workTitle" placeholder="Название работы / диссертации" class="text-input">
    </div>

    <!-- Download button -->
    <button class="download-btn" id="downloadBtn">
      <span>⬇ Скачать PDF</span>
    </button>

    <div class="footer">Hologram Calculator v1.0</div>
  </div>

  <script src="jspdf.umd.min.js"></script>
  <script src="popup.js"></script>
</body>
</html>`;

const POPUP_CSS = `* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  width: 360px;
  min-height: 480px;
  background: #060B18;
  color: #E8EAF6;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
}

.container { padding: 0 0 8px 0; }

.header {
  background: #0D1526;
  padding: 12px 16px;
  border-bottom: 1px solid #1E3A5F;
}

.logo { display: flex; align-items: center; gap: 10px; }
.title { font-size: 15px; font-weight: 700; color: #00E5FF; }
.subtitle { font-size: 11px; color: #90A4AE; }

.status-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px;
  background: #0D1526;
  border-bottom: 1px solid #1E3A5F;
  font-size: 12px;
}
.status-bar.connected { color: #69F0AE; }
.status-bar.disconnected { color: #FF5252; }
.status-bar.checking { color: #90A4AE; }

.params-section, .settings-section, .author-section {
  padding: 10px 16px;
  border-bottom: 1px solid #1E3A5F;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #90A4AE;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.params-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.param-item {
  background: #111827;
  border: 1px solid #1E3A5F;
  border-radius: 6px;
  padding: 6px 8px;
  text-align: center;
}
.param-label { display: block; font-size: 10px; color: #90A4AE; font-style: italic; }
.param-value { display: block; font-size: 12px; font-weight: 600; color: #00E5FF; font-family: monospace; }

.checkboxes { display: flex; flex-direction: column; gap: 5px; }
.checkbox-item {
  display: flex; align-items: center; gap: 8px;
  cursor: pointer; color: #B0BEC5; font-size: 12px;
}
.checkbox-item input[type="checkbox"] { accent-color: #00E5FF; }
.checkbox-item:hover { color: #E8EAF6; }

.author-section { display: flex; flex-direction: column; gap: 6px; }
.text-input {
  background: #111827;
  border: 1px solid #1E3A5F;
  border-radius: 6px;
  padding: 7px 10px;
  color: #E8EAF6;
  font-size: 12px;
  width: 100%;
  outline: none;
}
.text-input:focus { border-color: #00E5FF; }
.text-input::placeholder { color: #546E7A; }

.download-btn {
  display: block;
  width: calc(100% - 32px);
  margin: 12px 16px 0;
  padding: 11px;
  background: linear-gradient(135deg, #00E5FF, #1565C0);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.download-btn:hover { opacity: 0.9; }
.download-btn:disabled { opacity: 0.5; cursor: not-allowed; background: #1E3A5F; }

.footer {
  text-align: center;
  padding: 8px;
  font-size: 10px;
  color: #37474F;
}`;

const POPUP_JS = `// State
let hologramData = null;
let currentTabId = null;

// DOM refs
const statusBar = document.getElementById('statusBar');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');
const paramsSection = document.getElementById('paramsSection');
const downloadBtn = document.getElementById('downloadBtn');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  // Check if we're on the hologram app
  const isHologramApp = tab.url && (
    tab.url.includes('localhost:3100') ||
    tab.url.includes('localhost:3000') ||
    tab.url.includes('vercel.app')
  );

  if (!isHologramApp) {
    setStatus('disconnected', '✗ Откройте приложение Hologram Lab');
    downloadBtn.disabled = true;
    return;
  }

  // Try to get data from content script
  try {
    chrome.tabs.sendMessage(currentTabId, { type: 'GET_HOLOGRAM_DATA' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        setStatus('disconnected', '✗ Перейдите на вкладку "Математика"');
        downloadBtn.disabled = false; // allow generating with defaults
        hologramData = getDefaultData();
        showParams(hologramData);
        return;
      }
      hologramData = response.data;
      setStatus('connected', '✓ Подключено к Hologram Lab');
      paramsSection.style.display = 'block';
      showParams(hologramData);
    });
  } catch (e) {
    setStatus('disconnected', '✗ Ошибка подключения');
    hologramData = getDefaultData();
  }

  downloadBtn.addEventListener('click', generatePDF);
});

function getDefaultData() {
  return {
    input: { lambda: 632.8, theta: 30, deltaLambda: 0.01 },
    results: { d_nm: 1222.6, d_um: 1.223, N: 818, Lc_mm: 40.04, Lc_cm: 4.0, alpha_deg: 31.2 },
    steps: [
      'd = 632.8 / (2·sin(15.0°)) = 1222.57 нм',
      'N = 10⁶ / 1222.57 = 817.9 лин/мм',
      'Lc = 632.8² / 0.010 = 40.04 мм',
      'α = arcsin(0.5174) = 31.15°'
    ]
  };
}

function setStatus(type, text) {
  statusBar.className = \`status-bar \${type}\`;
  statusIcon.textContent = type === 'connected' ? '✓' : type === 'disconnected' ? '✗' : '⟳';
  statusText.textContent = text;
}

function showParams(data) {
  if (!data) return;
  paramsSection.style.display = 'block';
  document.getElementById('pLambda').textContent = data.input.lambda.toFixed(1) + ' нм';
  document.getElementById('pTheta').textContent = data.input.theta + '°';
  document.getElementById('pDelta').textContent = data.input.deltaLambda.toFixed(3) + ' нм';
  document.getElementById('pD').textContent = data.results.d_nm.toFixed(1) + ' нм';
  document.getElementById('pN').textContent = data.results.N.toFixed(0) + ' л/мм';
  document.getElementById('pLc').textContent = data.results.Lc_cm.toFixed(2) + ' см';
  document.getElementById('pAlpha').textContent = (isNaN(data.results.alpha_deg) ? 'N/A' : data.results.alpha_deg.toFixed(1) + '°');
}

async function generatePDF() {
  if (!hologramData) hologramData = getDefaultData();

  downloadBtn.disabled = true;
  downloadBtn.querySelector('span').textContent = '⟳ Генерация...';

  try {
    const author = document.getElementById('authorName').value || 'Автор не указан';
    const workTitle = document.getElementById('workTitle').value || 'Диссертационная работа';
    const date = new Date().toLocaleDateString('ru-RU');

    const chkParams = document.getElementById('chkParams').checked;
    const chkFormulas = document.getElementById('chkFormulas').checked;
    const chkSteps = document.getElementById('chkSteps').checked;
    const chkTable = document.getElementById('chkTable').checked;
    const chkTheory = document.getElementById('chkTheory').checked;
    const chkComparison = document.getElementById('chkComparison').checked;

    // Use jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const W = 210, H = 297;
    const margin = 20;
    const contentW = W - 2 * margin;
    let y = margin;

    // Helper functions
    function addPageIfNeeded(spaceNeeded = 20) {
      if (y + spaceNeeded > H - 20) {
        doc.addPage();
        y = margin;
        addFooter();
      }
    }

    function addFooter() {
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(\`Расчёт параметров transmission голограммы | \${date}\`, W / 2, H - 10, { align: 'center' });
    }

    function sectionTitle(text) {
      addPageIfNeeded(15);
      doc.setFillColor(13, 21, 38);
      doc.rect(margin, y, contentW, 8, 'F');
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 229, 255);
      doc.text(text, margin + 3, y + 5.5);
      y += 12;
    }

    function bodyText(text, indent = 0) {
      addPageIfNeeded(7);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(text, contentW - indent);
      doc.text(lines, margin + indent, y);
      y += lines.length * 6;
    }

    function monoText(text, indent = 0) {
      addPageIfNeeded(7);
      doc.setFontSize(10);
      doc.setFont('courier', 'normal');
      doc.setTextColor(20, 20, 80);
      const lines = doc.splitTextToSize(text, contentW - indent);
      doc.text(lines, margin + indent, y);
      y += lines.length * 5.5;
    }

    // --- PAGE 1: Title page ---
    doc.setFillColor(6, 11, 24);
    doc.rect(0, 0, W, H, 'F');

    // Decorative top bar
    doc.setFillColor(0, 229, 255);
    doc.rect(0, 0, W, 3, 'F');
    doc.setFillColor(156, 39, 176);
    doc.rect(0, 3, W, 2, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 150, 180);
    doc.text('TRANSMISSION HOLOGRAM CALCULATOR', W / 2, 60, { align: 'center' });

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 229, 255);
    doc.text('РАСЧЁТ ПАРАМЕТРОВ', W / 2, 90, { align: 'center' });
    doc.text('ТРАНСМИССИОННОЙ', W / 2, 102, { align: 'center' });
    doc.text('ГОЛОГРАММЫ', W / 2, 114, { align: 'center' });

    // Divider
    doc.setDrawColor(30, 58, 95);
    doc.setLineWidth(0.5);
    doc.line(margin + 20, 125, W - margin - 20, 125);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 220, 240);
    doc.text(\`Автор: \${author}\`, W / 2, 145, { align: 'center' });
    doc.text(workTitle, W / 2, 155, { align: 'center' });
    doc.text(\`Дата: \${date}\`, W / 2, 168, { align: 'center' });

    // Parameters summary box on title page
    doc.setFillColor(13, 21, 38);
    doc.roundedRect(margin + 15, 185, contentW - 30, 55, 4, 4, 'F');
    doc.setDrawColor(30, 58, 95);
    doc.roundedRect(margin + 15, 185, contentW - 30, 55, 4, 4, 'S');

    doc.setFontSize(10);
    doc.setFont('courier', 'bold');
    doc.setTextColor(0, 229, 255);
    doc.text('λ = ' + hologramData.input.lambda.toFixed(1) + ' нм', margin + 30, 200);
    doc.text('θ = ' + hologramData.input.theta + '°', margin + 80, 200);
    doc.text('Δλ = ' + hologramData.input.deltaLambda.toFixed(3) + ' нм', margin + 120, 200);

    doc.setTextColor(105, 240, 174);
    doc.text('d = ' + hologramData.results.d_nm.toFixed(1) + ' нм', margin + 30, 215);
    doc.text('N = ' + hologramData.results.N.toFixed(0) + ' лин/мм', margin + 80, 215);
    doc.text('Lc = ' + hologramData.results.Lc_cm.toFixed(2) + ' см', margin + 130, 215);

    doc.setTextColor(255, 179, 0);
    doc.text('α = ' + (isNaN(hologramData.results.alpha_deg) ? 'N/A' : hologramData.results.alpha_deg.toFixed(2) + '°'), margin + 30, 230);

    doc.setFontSize(8);
    doc.setTextColor(80, 100, 120);
    doc.text('Сгенерировано: Hologram Calculator v1.0', W / 2, 260, { align: 'center' });

    // Bottom bar
    doc.setFillColor(30, 58, 95);
    doc.rect(0, H - 5, W, 5, 'F');

    // --- PAGE 2 onwards ---
    doc.addPage();
    y = margin;
    addFooter();

    // Parameters section
    if (chkParams) {
      sectionTitle('1. ВХОДНЫЕ ПАРАМЕТРЫ');

      const params = [
        ['Длина волны лазера (λ)', hologramData.input.lambda.toFixed(1) + ' нм'],
        ['Угол между лучами (θ)', hologramData.input.theta + '°'],
        ['Ширина спектральной линии (Δλ)', hologramData.input.deltaLambda.toFixed(3) + ' нм'],
      ];

      params.forEach(([label, value]) => {
        addPageIfNeeded(8);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(label + ':', margin + 5, y);
        doc.setFont('courier', 'bold');
        doc.setTextColor(0, 100, 180);
        doc.text(value, margin + contentW - 40, y, { align: 'right' });
        y += 7;
      });
      y += 5;
    }

    // Formulas section
    if (chkFormulas) {
      sectionTitle('2. ИСПОЛЬЗУЕМЫЕ ФОРМУЛЫ');

      const formulas = [
        ['1. Период интерференционных полос:', 'd = λ / (2 · sin(θ/2))'],
        ['2. Пространственная частота (разрешение плёнки):', 'N = 10⁶ / d  [линий/мм]'],
        ['3. Длина когерентности:', 'Lc = λ² / Δλ'],
        ['4. Угол дифракции первого порядка:', 'α = arcsin(λ/d)'],
        ['5. Интенсивность интерференционного поля:', 'I(x,y) = Ar² + Ao² + 2·Ar·Ao·cos(φ(x,y))'],
        ['6. Пропускающая функция голограммы:', 'T(x,y) = T₀ + β·I(x,y)'],
      ];

      formulas.forEach(([label, formula]) => {
        addPageIfNeeded(14);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(label, margin + 5, y);
        y += 6;
        doc.setFont('courier', 'normal');
        doc.setTextColor(20, 20, 120);
        doc.setFillColor(245, 245, 255);
        doc.rect(margin + 5, y - 4, contentW - 5, 7, 'F');
        doc.text(formula, margin + 8, y + 1);
        y += 10;
      });
      y += 3;
    }

    // Step-by-step section
    if (chkSteps) {
      sectionTitle('3. ПОШАГОВЫЙ РАСЧЁТ');

      const d = hologramData;
      const lambda = d.input.lambda;
      const theta = d.input.theta;
      const dLambda = d.input.deltaLambda;
      const thetaHalf = theta / 2;
      const sinHalf = Math.sin(thetaHalf * Math.PI / 180);

      const steps = [
        {
          title: 'Шаг 1. Период интерференционных полос:',
          lines: [
            'd = λ / (2·sin(θ/2))',
            \`d = \${lambda.toFixed(1)} / (2·sin(\${thetaHalf.toFixed(1)}°))\`,
            \`d = \${lambda.toFixed(1)} / (2 × \${sinHalf.toFixed(4)})\`,
            \`d = \${lambda.toFixed(1)} / \${(2 * sinHalf).toFixed(4)}\`,
            \`d = \${d.results.d_nm.toFixed(2)} нм = \${d.results.d_um.toFixed(4)} мкм\`,
          ]
        },
        {
          title: 'Шаг 2. Необходимое разрешение плёнки:',
          lines: [
            'N = 10⁶ / d',
            \`N = 1 000 000 / \${d.results.d_nm.toFixed(2)}\`,
            \`N = \${d.results.N.toFixed(1)} линий/мм\`,
            d.results.N < 1000
              ? '→ Стандартная голографическая плёнка подходит'
              : d.results.N > 5000
                ? '→ Требуется специальная плёнка (>5000 лин/мм)'
                : '→ Стандартная плёнка подходит (1000-5000 лин/мм)'
          ]
        },
        {
          title: 'Шаг 3. Длина когерентности (макс. глубина сцены):',
          lines: [
            'Lc = λ² / Δλ',
            \`Lc = (\${lambda.toFixed(1)})² / \${dLambda.toFixed(4)}\`,
            \`Lc = \${(lambda * lambda).toFixed(1)} / \${dLambda.toFixed(4)}\`,
            \`Lc = \${d.results.Lc_mm.toFixed(2)} мм = \${d.results.Lc_cm.toFixed(3)} см\`,
            \`→ Максимальная глубина записываемой сцены: \${d.results.Lc_cm.toFixed(2)} см\`
          ]
        },
        {
          title: 'Шаг 4. Угол дифракции первого порядка:',
          lines: [
            'α = arcsin(λ/d)',
            \`α = arcsin(\${lambda.toFixed(1)} / \${d.results.d_nm.toFixed(2)})\`,
            \`α = arcsin(\${(lambda / d.results.d_nm).toFixed(4)})\`,
            isNaN(d.results.alpha_deg) ? 'α = не определено (λ > d)' : \`α = \${d.results.alpha_deg.toFixed(2)}°\`,
            isNaN(d.results.alpha_deg) ? '' : \`→ Восстановленное изображение наблюдается под углом \${d.results.alpha_deg.toFixed(2)}°\`
          ]
        }
      ];

      steps.forEach(step => {
        addPageIfNeeded(40);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 40, 40);
        doc.text(step.title, margin + 5, y);
        y += 7;

        doc.setFillColor(248, 249, 252);
        doc.rect(margin + 5, y - 2, contentW - 5, step.lines.filter(Boolean).length * 6 + 4, 'F');

        step.lines.filter(Boolean).forEach(line => {
          monoText(line, 8);
        });
        y += 5;
      });
    }

    // Results table
    if (chkTable) {
      sectionTitle('4. ТАБЛИЦА РЕЗУЛЬТАТОВ');

      const tableData = [
        ['Период полос d', hologramData.results.d_nm.toFixed(2) + ' нм'],
        ['Период полос d', hologramData.results.d_um.toFixed(4) + ' мкм'],
        ['Разрешение плёнки N', hologramData.results.N.toFixed(0) + ' линий/мм'],
        ['Длина когерентности Lc', hologramData.results.Lc_mm.toFixed(2) + ' мм'],
        ['Макс. глубина сцены', hologramData.results.Lc_cm.toFixed(3) + ' см'],
        ['Угол дифракции α (m=1)', isNaN(hologramData.results.alpha_deg) ? 'N/A' : hologramData.results.alpha_deg.toFixed(2) + '°'],
        ['Совместимость с плёнкой', hologramData.results.N <= 5000 ? '✓ Подходит' : '⚠ Требуется спец. плёнка'],
      ];

      addPageIfNeeded(tableData.length * 9 + 10);

      // Table header
      doc.setFillColor(13, 21, 38);
      doc.rect(margin + 5, y, contentW - 5, 8, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 229, 255);
      doc.text('Параметр', margin + 10, y + 5.5);
      doc.text('Значение', margin + contentW - 35, y + 5.5, { align: 'right' });
      y += 9;

      tableData.forEach(([label, value], i) => {
        addPageIfNeeded(9);
        if (i % 2 === 0) {
          doc.setFillColor(245, 247, 252);
          doc.rect(margin + 5, y - 1, contentW - 5, 8, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(10);
        doc.text(label, margin + 10, y + 5);
        doc.setFont('courier', 'bold');
        doc.setTextColor(0, 80, 160);
        doc.text(value, margin + contentW - 10, y + 5, { align: 'right' });
        doc.setDrawColor(200, 210, 230);
        doc.line(margin + 5, y + 8, margin + contentW, y + 8);
        y += 9;
      });
      y += 5;
    }

    // Theory section
    if (chkTheory) {
      sectionTitle('5. ПРИНЦИП РАБОТЫ ТРАНСМИССИОННОЙ ГОЛОГРАММЫ');

      bodyText('Трансмиссионная голограмма — это интерференционная картина, записанная на светочувствительной фотоэмульсии. В отличие от обычной фотографии, голограмма сохраняет не только амплитуду световой волны, но и её фазу — что позволяет восстановить полную трёхмерную информацию об объекте.');
      y += 3;
      bodyText('ЗАПИСЬ: Два когерентных лазерных пучка (опорный и объектный) накладываются на фотоэмульсии, создавая систему интерференционных полос. Эти полосы содержат закодированную информацию о форме и положении объекта.');
      y += 3;
      bodyText('ВОССТАНОВЛЕНИЕ: При освещении голограммы опорным лазерным пучком происходит дифракция. Первый дифракционный порядок восстанавливает исходную объектную волну — наблюдатель видит трёхмерное виртуальное изображение объекта.');
    }

    // Comparison section
    if (chkComparison) {
      sectionTitle('6. СРАВНЕНИЕ: TRANSMISSION vs REFLECTION');

      const compData = [
        ['Геометрия лучей при записи', 'Оба луча с одной стороны', 'Лучи с противоположных сторон'],
        ['Освещение при просмотре', 'Лазер сзади плёнки', 'Белый свет спереди'],
        ['Цветопередача', 'Одноцветная', 'Возможна многоцветная'],
        ['Дисперсия', 'Высокая', 'Низкая (Брэгг)'],
        ['Применение', 'Лаборатория, наука', 'Банкноты, паспорта, арт'],
      ];

      addPageIfNeeded(compData.length * 10 + 20);

      // Headers
      doc.setFillColor(13, 21, 38);
      doc.rect(margin + 5, y, contentW - 5, 8, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 229, 255);
      doc.text('Параметр', margin + 10, y + 5.5);
      doc.text('Transmission', margin + 80, y + 5.5);
      doc.text('Reflection', margin + 140, y + 5.5);
      y += 9;

      compData.forEach(([param, trans, refl], i) => {
        addPageIfNeeded(10);
        if (i % 2 === 0) {
          doc.setFillColor(245, 247, 252);
          doc.rect(margin + 5, y - 1, contentW - 5, 9, 'F');
        }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        doc.text(param, margin + 8, y + 5);
        doc.setTextColor(0, 80, 160);
        doc.text(trans, margin + 78, y + 5);
        doc.setTextColor(100, 0, 150);
        doc.text(refl, margin + 138, y + 5);
        y += 9;
      });
    }

    // Final footer on last page
    addFooter();

    // Save
    const filename = \`hologram-calc-\${date.replace(/\\./g, '-')}.pdf\`;
    doc.save(filename);

  } catch (err) {
    console.error('PDF generation error:', err);
    alert('Ошибка генерации PDF: ' + err.message);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.querySelector('span').textContent = '⬇ Скачать PDF';
  }
}`;

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#00E5FF"/>
      <stop offset="100%" style="stop-color:#9C27B0"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="24" fill="#0D1526"/>
  <!-- Interference fringes pattern -->
  <line x1="24" y1="30" x2="104" y2="30" stroke="url(#g)" stroke-width="4" opacity="0.9"/>
  <line x1="24" y1="44" x2="104" y2="44" stroke="url(#g)" stroke-width="3" opacity="0.7"/>
  <line x1="24" y1="58" x2="104" y2="58" stroke="url(#g)" stroke-width="4" opacity="0.9"/>
  <line x1="24" y1="72" x2="104" y2="72" stroke="url(#g)" stroke-width="3" opacity="0.7"/>
  <line x1="24" y1="86" x2="104" y2="86" stroke="url(#g)" stroke-width="4" opacity="0.9"/>
  <line x1="24" y1="100" x2="104" y2="100" stroke="url(#g)" stroke-width="3" opacity="0.7"/>
  <!-- PDF label -->
  <text x="64" y="70" font-family="monospace" font-size="18" font-weight="bold" fill="#00E5FF" text-anchor="middle">PDF</text>
</svg>`;

const README = `Hologram Calculator — PDF Export Extension
==========================================

Установка:
1. Распакуйте этот архив в любую папку
2. Откройте Chrome и перейдите на chrome://extensions
3. Включите "Режим разработчика" (переключатель справа вверху)
4. Нажмите "Загрузить распакованное расширение"
5. Выберите папку hologram-extension (эту папку)

Использование:
1. Откройте приложение Hologram Calculator
2. Перейдите на вкладку "Математика"
3. Настройте параметры (λ, θ, Δλ)
4. Нажмите на иконку расширения в панели Chrome
5. Заполните имя автора и название работы
6. Нажмите "⬇ Скачать PDF"

Совместимость: Chrome 88+, Edge 88+
Версия: 1.0.0
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExtensionDownload() {
  const { lang } = useLang();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function handleDownload() {
    setStatus('loading');
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const folder = zip.folder('hologram-extension')!;

      // Add text files
      folder.file('manifest.json', MANIFEST);
      folder.file('content.js', CONTENT_JS);
      folder.file('service-worker.js', SERVICE_WORKER);
      folder.file('popup.html', POPUP_HTML);
      folder.file('popup.css', POPUP_CSS);
      folder.file('popup.js', POPUP_JS);
      folder.file('icon-16.svg', ICON_SVG);
      folder.file('icon-48.svg', ICON_SVG);
      folder.file('icon-128.svg', ICON_SVG);
      folder.file('README.txt', README);

      // Fetch and add jsPDF binary
      const res = await fetch('/jspdf.umd.min.js');
      if (!res.ok) throw new Error('Failed to fetch jsPDF');
      const buf = await res.arrayBuffer();
      folder.file('jspdf.umd.min.js', buf);

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hologram-pdf-extension.zip';
      a.click();
      URL.revokeObjectURL(url);
      setStatus('idle');
    } catch (e) {
      console.error(e);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }

  return (
    <div
      className="flex items-center gap-4 rounded-xl px-5 py-3"
      style={{ background: 'linear-gradient(135deg, #0D1F38, #1A0D2E)', border: '1px solid #00E5FF44' }}
    >
      <div className="text-2xl">📄</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm" style={{ color: '#00E5FF' }}>
          {lang === 'ru' ? 'Экспорт в PDF для диссертации' : 'Dissertatsiya uchun PDFga eksport'}
        </div>
        <div className="text-xs mt-0.5" style={{ color: '#90A4AE' }}>
          {lang === 'ru'
            ? 'Chrome-расширение: скачайте ZIP → распакуйте → установите в chrome://extensions'
            : 'Chrome kengaytmasi: ZIP yuklab oling → chiqaring → chrome://extensions da o\'rnating'}
        </div>
      </div>
      <button
        onClick={handleDownload}
        disabled={status === 'loading'}
        className="shrink-0 text-xs font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #00E5FF, #1565C0)', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        {status === 'loading'
          ? (lang === 'ru' ? '⟳ Упаковка...' : '⟳ Paketlanmoqda...')
          : status === 'error'
          ? (lang === 'ru' ? '✗ Ошибка' : '✗ Xato')
          : (lang === 'ru' ? '⬇ Скачать .zip' : '⬇ .zip yuklab olish')}
      </button>
      <div
        className="shrink-0 text-xs rounded-lg px-3 py-2 hidden sm:block"
        style={{ background: '#111827', border: '1px solid #1E3A5F', color: '#546E7A', fontFamily: 'monospace' }}
      >
        chrome://extensions
      </div>
    </div>
  );
}
