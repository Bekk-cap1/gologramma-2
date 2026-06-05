import JSZip from "jszip";

// ─── helpers ──────────────────────────────────────────────────────────────────
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type RunOpt = { bold?: boolean; italic?: boolean; sz?: number; color?: string; font?: string };

function run(text: string, opt: RunOpt = {}) {
  const props = [
    opt.bold   ? "<w:b/><w:bCs/>" : "",
    opt.italic ? "<w:i/><w:iCs/>" : "",
    opt.sz     ? `<w:sz w:val="${opt.sz * 2}"/><w:szCs w:val="${opt.sz * 2}"/>` : "",
    opt.color  ? `<w:color w:val="${opt.color.replace("#", "")}"/>` : "",
    opt.font   ? `<w:rFonts w:ascii="${opt.font}" w:hAnsi="${opt.font}"/>` : "",
  ].join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function para(runs: string, opts: { spaceAfter?: number; indent?: number; center?: boolean; shading?: string } = {}) {
  const pPr = [
    opts.spaceAfter != null ? `<w:spacing w:after="${opts.spaceAfter}"/>` : "",
    opts.indent     ? `<w:ind w:left="${opts.indent}"/>` : "",
    opts.center     ? `<w:jc w:val="center"/>` : "",
    opts.shading    ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.shading.replace("#", "")}"/>` : "",
  ].join("");
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${runs}</w:p>`;
}

function h1(text: string) {
  return para(run(text, { bold: true, sz: 18, color: "#003366" }), { spaceAfter: 120 });
}
function h2(text: string) {
  return para(run(text, { bold: true, sz: 14, color: "#005599" }), { spaceAfter: 80 });
}
function h3(text: string) {
  return para(run(text, { bold: true, sz: 12, color: "#0077AA" }), { spaceAfter: 60 });
}
function p(text: string, indent = 0) {
  return para(run(text, { sz: 11 }), { spaceAfter: 60, indent });
}
function pBold(text: string) {
  return para(run(text, { bold: true, sz: 11 }), { spaceAfter: 60 });
}
function pCode(text: string) {
  return para(run(text, { sz: 10, font: "Courier New", color: "#003300" }), {
    spaceAfter: 20, indent: 360, shading: "#F0F4F0",
  });
}
function pEmpty() {
  return "<w:p><w:r><w:t></w:t></w:r></w:p>";
}

function cell(content: string, opts: { bold?: boolean; bg?: string; w?: number } = {}) {
  const shd = opts.bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.bg.replace("#", "")}"/>` : "";
  const cellW = opts.w ? `<w:tcW w:w="${opts.w}" w:type="dxa"/>` : `<w:tcW w:w="1800" w:type="dxa"/>`;
  return `<w:tc>
    <w:tcPr>${cellW}${shd}</w:tcPr>
    <w:p><w:r>${opts.bold ? "<w:rPr><w:b/><w:bCs/></w:rPr>" : ""}<w:t xml:space="preserve">${esc(content)}</w:t></w:r></w:p>
  </w:tc>`;
}

function tableRow(cells: string[], headerBg?: string) {
  return `<w:tr>${cells.map(c =>
    `<w:tc>
      <w:tcPr><w:tcW w:w="0" w:type="auto"/>${headerBg ? `<w:shd w:val="clear" w:color="auto" w:fill="${headerBg.replace("#", "")}"/>` : ""}</w:tcPr>
      <w:p><w:r><w:rPr>${headerBg ? "<w:b/><w:bCs/>" : ""}</w:rPr><w:t xml:space="preserve">${esc(c)}</w:t></w:r></w:p>
    </w:tc>`
  ).join("")}</w:tr>`;
}

function table(rows: string[][]) {
  const [header, ...body] = rows;
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="9360" w:type="dxa"/>
      <w:tblBorders>
        <w:top    w:val="single" w:sz="4" w:space="0" w:color="9E9E9E"/>
        <w:left   w:val="single" w:sz="4" w:space="0" w:color="9E9E9E"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="9E9E9E"/>
        <w:right  w:val="single" w:sz="4" w:space="0" w:color="9E9E9E"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="BDBDBD"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="BDBDBD"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top    w:w="80" w:type="dxa"/>
        <w:left   w:w="100" w:type="dxa"/>
        <w:bottom w:w="80" w:type="dxa"/>
        <w:right  w:w="100" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
    ${tableRow(header, "#D0E8F5")}
    ${body.map(r => tableRow(r)).join("\n")}
  </w:tbl>`;
}

// ─── document body ────────────────────────────────────────────────────────────
function buildBody(): string {
  const parts: string[] = [];

  // ── Cover ──
  parts.push(para(
    run("TRANSMISSION HOLOGRAMMA", { bold: true, sz: 22, color: "#003366" }),
    { center: true, spaceAfter: 120 }
  ));
  parts.push(para(
    run("Algoritm va Arxitektura", { bold: true, sz: 16, color: "#005599" }),
    { center: true, spaceAfter: 80 }
  ));
  parts.push(para(
    run("Interaktiv ta\'lim platformasi — to\'liq texnik hujjat", { italic: true, sz: 12, color: "#666666" }),
    { center: true, spaceAfter: 240 }
  ));
  parts.push(pEmpty());

  // ── §1 ──
  parts.push(h1("§1. Ilovaning umumiy tuzilmasi (Arxitektura)"));
  parts.push(p(
    "Ushbu platforma Next.js 16 (App Router) va React 19 asosida qurilgan to'liq mijoz tomonidagi (client-side) ilova bo'lib, " +
    "11 ta interaktiv bo'limdan iborat. Ilova hech qanday backend yoki ma'lumotlar bazasisiz ishlaydi — barcha hisob-kitoblar " +
    "foydalanuvchi brauzerida real vaqtda amalga oshiriladi."
  ));
  parts.push(pEmpty());

  parts.push(h3("Asosiy texnologiyalar:"));
  parts.push(p("• Next.js 16 — App Router, Turbopack, SSR→CSR"));
  parts.push(p("• React 19 — Hooks: useState, useEffect, useRef, useMemo"));
  parts.push(p("• Three.js — WebGL orqali 3D vizualizatsiya (ReconstructionSim, FractalCNN)"));
  parts.push(p("• Canvas 2D API — Optik stol, matematika, yozish animatsiyasi"));
  parts.push(p("• TypeScript — To'liq tiplanganlik, xavfsizlik"));
  parts.push(p("• CSS o'zgaruvchilar — qorang'i/yorug' mavzu, var(--bg-primary) va h.k."));
  parts.push(pEmpty());

  parts.push(h3("Bo'limlar ro'yxati:"));
  parts.push(table([
    ["#", "Bo'lim nomi", "Asosiy maqsad"],
    ["0",  "Jihozlar",            "8 ta golografik asbob-uskuna tavsifi"],
    ["1",  "Optik sxema",         "Qurilmaning SVG diagrammasi"],
    ["2",  "Yozish",              "Yozish jarayonining animatsiyasi"],
    ["3",  "Matematika",          "Interaktiv kalkulyator va formulalar"],
    ["4",  "Tiklash",             "Difraksiya fizikasi"],
    ["5",  "Bo'lak = Butun",      "Gologramma o'z-o'ziga o'xshashlik xususiyati"],
    ["6",  "Taqqoslash",          "Transmissiya vs Refleksiya"],
    ["7",  "Optik stol",          "Interaktiv nur kuzatish konstruktori"],
    ["8",  "Simulyator",          "Three.js 3D tiklash simulyatori"],
    ["9",  "2D → 3D",             "Mandelbulb ray-marching + CNN chuqurlik"],
    ["10", "Algoritm",            "Arxitektura, algoritmlar, taqqoslash"],
  ]));
  parts.push(pEmpty());

  // ── §2 ──
  parts.push(h1("§2. Gologramma Yozish Algoritmi"));
  parts.push(p(
    "Transmissiya gologrammasini yozish — ikki koherent lazer nurini optik plyonkada uchrashtirish jarayonidir. " +
    "Ushbu jarayon quyidagi ketma-ket bosqichlardan iborat:"
  ));
  parts.push(pEmpty());

  parts.push(h3("1-bosqich: Lazer nuri hosil qilish"));
  parts.push(pCode("E_r = A_r · exp(i·k·r)"));
  parts.push(p(
    "A_r — amplituda, k = 2π/λ — to'lqin soni, r — koordinata. He-Ne lazer uchun λ = 632.8 nm. " +
    "Koherentlik uzunligi: Lc = λ²/Δλ ≈ 30 sm. Bu — ikki nurning optik yo'l farqi shu qiymatdan oshmasligi kerakligini bildiradi."
  ));

  parts.push(h3("2-bosqich: Nur bo'lgich (Beam Splitter)"));
  parts.push(p(
    "Yarim shaffof ko'zgu nurnni 50/50 nisbatida ikki qismga bo'ladi: " +
    "tayanch nuri (reference beam) — to'g'ridan-to'g'ri plyonkaga, " +
    "ob'ekt nuri (object beam) — ob'ektga yo'naltiriladi."
  ));

  parts.push(h3("3-bosqich: Ob'ektdan tarqalish"));
  parts.push(pCode("E_0 = A_0 · exp(i·k·r + i·φ(x,y))"));
  parts.push(p(
    "Ob'ektdan tarqalgan nur φ(x,y,z) faza kechikishini olib boradi — bu 3D shaklning kodlangan tasviridir."
  ));

  parts.push(h3("4-bosqich: Plyonkada interferensiya"));
  parts.push(pCode("I(x,y) = |E_r + E_0|² = A_r² + A_0² + 2·A_r·A_0·cos(φ)"));
  parts.push(p(
    "Interferensiya chizig'lari davri: d = λ / (2·sin(θ/2)). " +
    "θ = 30° va λ = 632.8 nm uchun: d ≈ 1223 nm = 1.2 mkm. " +
    "Shu sababli golografik plyonkaning aniqligi 1000–5000 chiziq/mm bo'lishi kerak."
  ));

  parts.push(h3("5-bosqich: Plyonka o'tkazuvchanligi"));
  parts.push(pCode("T(x,y) = T₀ + β · I(x,y)"));
  parts.push(p(
    "T₀ — fon o'tkazuvchanligi, β — emulsiyaning ekspozitsiyaga sezgirligi. " +
    "Kimyoviy ishlovdan (rivojlantirish + oqartirish) so'ng gologramma tayyor bo'ladi."
  ));
  parts.push(pEmpty());

  // ── §3 ──
  parts.push(h1("§3. Tiklash Algoritmi"));
  parts.push(p(
    "Tayyor gologrammani tayanch lazer nuri bilan yoritganda difraksiya hodisasi yuz beradi. " +
    "Bragg sharting bajarilishi uchun tiklash to'lqin uzunligi va burchagi yozish parametrlariga mos kelishi zarur."
  ));
  parts.push(pEmpty());

  parts.push(pCode("T · E_r = T₀·E_r + β·A_r²·E_r + β·A_r·A_0·exp(iφ) + β·A_r·A_0·exp(-iφ)"));
  parts.push(pEmpty());

  parts.push(table([
    ["Tartib", "Ifoda", "Tavsif"],
    ["0-chi (fon)",    "T₀·E_r + β·A_r²·E_r",       "To'g'ri nur — ob'ekt ma'lumoti yo'q"],
    ["+1-chi (3D!)",   "β·A_r·A_0·exp(iφ)",           "Tiklangan ob'ekt to'lqini — virtual 3D tasvir"],
    ["-1-chi (teskari)","β·A_r·A_0·exp(-iφ)",          "Bog'liq to'lqin — psevdoskopik tasvir"],
  ]));
  parts.push(pEmpty());

  parts.push(p(
    "Muhim shart: agar λ_tiklash ≠ λ_yozish yoki θ_tiklash ≠ θ_yozish bo'lsa, " +
    "+1-chi tartib zaiflashadi va tasvir loyqa bo'ladi. " +
    "Simulyatorda bu hodisani slayder yordamida kuzatish mumkin."
  ));
  parts.push(pEmpty());

  // ── §4 ──
  parts.push(h1("§4. Nur Kuzatish Algoritmi (OpticalTable)"));
  parts.push(p(
    "Optik stol bo'limi ilovaning asosiy hisoblash yadrosi hisoblanadi. " +
    "U 2D Canvas ustida real vaqtda nur kuzatishni amalga oshiradi."
  ));
  parts.push(pEmpty());

  parts.push(h3("Asosiy ma'lumotlar tuzilmalari:"));
  parts.push(pCode("interface RaySource {"));
  parts.push(pCode("  id: string;"));
  parts.push(pCode("  x, y: number;      // pozitsiya"));
  parts.push(pCode("  angle: number;     // yo'nalish (gradus)"));
  parts.push(pCode("  color: string;     // '#FF4444' kabi"));
  parts.push(pCode("  skipId?: string;   // BS qayta urilishini oldini olish"));
  parts.push(pCode("}"));
  parts.push(pEmpty());
  parts.push(pCode("interface ComponentDef {"));
  parts.push(pCode("  id: string;"));
  parts.push(pCode("  type: 'laser' | 'beamsplitter' | 'mirror' | 'lens' | 'film' | 'object';"));
  parts.push(pCode("  x, y: number;"));
  parts.push(pCode("  angle: number;     // burish burchagi"));
  parts.push(pCode("  width, height: number;"));
  parts.push(pCode("}"));
  parts.push(pEmpty());

  parts.push(h3("Algoritm qadamlari:"));
  parts.push(p("1. Barcha komponentlar orasidan lazer topiladi"));
  parts.push(p("2. Lazerdan dastlabki nur chiqariladi (RaySource)"));
  parts.push(p("3. Har bir nur uchun AABB tekshiruvi bilan eng yaqin komponent aniqlanadi"));
  parts.push(p("4. Komponent turiga qarab amal bajariladi:"));
  parts.push(p("   • Beam Splitter: 2 ta nur (tayanch + ob'ekt) chiqariladi, skipId o'rnatiladi", 360));
  parts.push(p("   • Ko'zgu: Snell qonuni bo'yicha nur qaytariladi", 360));
  parts.push(p("   • Linza: Nur yo'nalishi o'zgartiriladi (sinish)", 360));
  parts.push(p("   • Plyonka: Urilish qayd etiladi, interferensiya tekshiriladi", 360));
  parts.push(p("   • Ob'ekt: Tarqalgan nurlar chiqariladi", 360));
  parts.push(p("5. 100 qadam chegarasiga yetguncha takrorlanadi"));
  parts.push(pEmpty());

  parts.push(p(
    "skipId mexanizmi: Beam Splitter chiqargan nurlar o'z manbalarini 'skipId' sifatida olib yuradi va " +
    "keyingi qadam da shu komponentni o'tkazib yuboradi. Bu kaskadli qayta urilish muammosini hal etadi."
  ));
  parts.push(pEmpty());

  // ── §5 ──
  parts.push(h1("§5. Golografiya Usullari — Miqdoriy Taqqoslash"));
  parts.push(p("Mezonlar 1 dan 10 gacha baholanadi (10 = eng yaxshi):"));
  parts.push(pEmpty());

  parts.push(table([
    ["Usul", "Aniqlik", "Yozish oddiyligi", "Lazersiz ko'rish", "Rang", "3D chuqurligi", "Ilmiy", "Jami /60"],
    ["Transmissiya (Leyt–Upatnieks)", "9", "7", "2", "3", "9", "10", "40"],
    ["Aks ettiruvchi (Denisyuk)",     "7", "6", "10","8", "8", "8",  "47"],
    ["Kamalak (Benton)",              "7", "5", "8", "6", "4", "6",  "36"],
    ["Gabor (inline)",                "6", "9", "5", "3", "3", "7",  "33"],
  ]));
  parts.push(pEmpty());
  parts.push(p(
    "Xulosа: Aks ettiruvchi Denisyuk gologrammasi oq yorug'likda ko'rish imkoniyati tufayli " +
    "amaliy qo'llash bo'yicha yetakchi (47/60). Transmissiya gologramma esa ilmiy tadqiqotlar va " +
    "yuqori aniqlik talab qilinadigan holatlarda ustunlik qiladi (40/60)."
  ));
  parts.push(pEmpty());

  // ── §6 ──
  parts.push(h1("§6. Lazerlar Taqqoslamasi"));
  parts.push(pEmpty());

  parts.push(table([
    ["Lazer", "λ (nm)", "Koherentlik", "Quvvat", "Narx", "Mavjudlik", "Barqarorlik", "Jami /50"],
    ["He-Ne",      "632.8", "10", "5", "4",  "7", "10", "36"],
    ["Nd:YAG×2",   "532",   "8",  "8", "7",  "9", "8",  "40"],
    ["Ar⁺",        "488",   "9",  "9", "2",  "4", "7",  "31"],
    ["Diod 405nm", "405",   "6",  "6", "9",  "9", "6",  "36"],
  ]));
  parts.push(pEmpty());
  parts.push(p(
    "★ Nd:YAG×2 (532 nm, yashil) — yangi boshlovchilar uchun eng yaxshi tanlov: " +
    "yashil lazer ko'rsatkichlari arzon ($10 dan), keng tarqalgan va barqaror. " +
    "He-Ne lazer esa eng yuqori barqarorlik va koherentlikka ega, lekin narxi yuqori."
  ));
  parts.push(pEmpty());

  // ── §7 — Uzbek only extra ──
  parts.push(h1("§7. Qo'shimcha Ma'lumot (O'zbekcha)"));

  parts.push(h2("7.1. Golografiyaning qisqacha tarixi"));
  parts.push(p(
    "Golografiya 1947 yilda Dennis Gabor tomonidan kashf etilgan. U elektron mikroskopiya aniqligini " +
    "oshirish yo'lini qidirish jarayonida golografiya printsipini yaratdi va 1971 yilda Nobel mukofotiga sazovor bo'ldi."
  ));
  parts.push(p(
    "1960 yilda lazer ixtiro qilingach, Emmet Leith va Juris Upatnieks birinchi marta yuqori sifatli " +
    "transmissiya gologrammasini yaratdilar (1962). Yuri Denisyuk esa oq yorug'likda ko'rinadigan " +
    "refleksiya gologrammasini ishlab chiqdi."
  ));
  parts.push(pEmpty());

  parts.push(h2("7.2. Golografiyaning hozirgi qo'llanishlari"));
  parts.push(table([
    ["Soha",           "Misol"],
    ["Xavfsizlik",     "Banknotalar, pasportlar, kredit kartalar"],
    ["Tibbiyot",       "3D anatomik modellar, jarrohlik rejalashtiruvi"],
    ["Sanoat",         "Tekshiruv, sirtni o'lchash (holographic interferometry)"],
    ["Ma'lumot saqlash","Holographic data storage — 1 sm³ da terabaytlar"],
    ["Reklama va san'at","Ko'rgazma eksponatlari, 3D ekranlar"],
    ["Mudofaa",        "HUD (Head-Up Display) uchuchun"],
  ]));
  parts.push(pEmpty());

  parts.push(h2("7.3. O'zbek talabalari uchun amaliy maslahatlar"));
  parts.push(p(
    "Gologramma yozish uchun eng muhim shart — tebranishlarni kamaytirish. " +
    "Agar maxsus pnevmatik stol bo'lmasa, quyidagi muqobil usullardan foydalaning:"
  ));
  parts.push(p("• Qum to'ldirilgan quti (200–300 kg) — arzon va samarali variant", 360));
  parts.push(p("• Shishirilgan avtomobil kameralari ustiga o'rnatilgan og'ir metall plita", 360));
  parts.push(p("• Tunda, transport kamligi vaqtida ishlash (yer tebranishlari kamayadi)", 360));
  parts.push(p("• Ekspozitsiya vaqtida xonadan chiqib ketish va eshiqni yopmay qoldirish", 360));
  parts.push(pEmpty());

  parts.push(h2("7.4. Asosiy formulalar — tez manba"));
  parts.push(table([
    ["Formula",                          "Belgilar",                          "Maqsad"],
    ["d = λ / (2·sin(θ/2))",            "d=chiziq davri, λ=to'lqin, θ=burchak","Interferensiya chiziq davrini hisoblash"],
    ["N = 10⁶ / d",                      "N=chiziq/mm, d=nm da",              "Plyonkaning kerakli aniqligi"],
    ["Lc = λ² / Δλ",                    "Lc=koherentlik uzunligi",            "Optik yo'llar farqining chegarasi"],
    ["α = arcsin(λ/d)",                  "α=difraksiya burchagi",             "Tiklanganda nur chiqish burchagi"],
    ["I = Ar² + A0² + 2·Ar·A0·cos(φ)", "I=intensivlik",                     "Plyonkadagi interferensiya intensivligi"],
  ]));
  parts.push(pEmpty());

  parts.push(h2("7.5. Atamalar lug'ati (O'zbekcha–Ruscha–Inglizcha)"));
  parts.push(table([
    ["O'zbekcha",           "Ruscha",              "Inglizcha"],
    ["Gologramma",          "Голограмма",           "Hologram"],
    ["Tayanch nuri",        "Опорный луч",          "Reference beam"],
    ["Ob'ekt nuri",         "Объектный луч",        "Object beam"],
    ["Nur bo'lgich",        "Светоделитель",        "Beam splitter"],
    ["Ko'zgu",              "Зеркало",              "Mirror"],
    ["Linza",               "Линза",                "Lens"],
    ["Plyonka",             "Плёнка",               "Film / Photosensitive plate"],
    ["Interferensiya",      "Интерференция",        "Interference"],
    ["Difraksiya",          "Дифракция",            "Diffraction"],
    ["Koherentlik",         "Когерентность",        "Coherence"],
    ["To'lqin uzunligi",    "Длина волны",          "Wavelength"],
    ["Tiklash",             "Восстановление",       "Reconstruction"],
    ["Tebranishdan himoya", "Виброизоляция",        "Vibration isolation"],
  ]));
  parts.push(pEmpty());

  // ── Footer ──
  parts.push(para(
    run("Ushbu hujjat Transmission Hologramma interaktiv ta'lim platformasidan avtomatik generatsiya qilingan.", {
      italic: true, sz: 9, color: "#999999",
    }),
    { center: true, spaceAfter: 0 }
  ));

  return parts.join("\n");
}

// ─── DOCX package assembly ────────────────────────────────────────────────────
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`;

const WORD_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

function buildDocumentXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1800" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

export async function generateAlgorithmDocx(): Promise<Blob> {
  const zip = new JSZip();

  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/_rels/document.xml.rels", WORD_RELS);
  zip.file("word/document.xml", buildDocumentXml(buildBody()));

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  return blob;
}
