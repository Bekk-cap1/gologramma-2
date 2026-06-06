// Run with: node scripts/gen-docx.cjs
const JSZip = require('jszip');
const fs    = require('fs');
const path  = require('path');

// ── helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function run(text, opt = {}) {
  const props = [
    opt.bold   ? '<w:b/><w:bCs/>'                                                             : '',
    opt.italic ? '<w:i/><w:iCs/>'                                                             : '',
    opt.sz     ? `<w:sz w:val="${opt.sz*2}"/><w:szCs w:val="${opt.sz*2}"/>`                   : '',
    opt.color  ? `<w:color w:val="${String(opt.color).replace('#','')}"/>`                    : '',
    opt.font   ? `<w:rFonts w:ascii="${opt.font}" w:hAnsi="${opt.font}" w:cs="${opt.font}"/>` : '',
  ].join('');
  return `<w:r>${props?`<w:rPr>${props}</w:rPr>`:''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function para(runs, opts = {}) {
  const pPr = [
    opts.spaceAfter != null ? `<w:spacing w:after="${opts.spaceAfter}"/>`                             : '',
    opts.indent             ? `<w:ind w:left="${opts.indent}"/>`                                      : '',
    opts.center             ? `<w:jc w:val="center"/>`                                               : '',
    opts.shading            ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.shading.replace('#','')}"/>` : '',
  ].join('');
  return `<w:p>${pPr?`<w:pPr>${pPr}</w:pPr>`:''}${runs}</w:p>`;
}

const h1 = t => para(run(t, {bold:true, sz:18, color:'#003366'}), {spaceAfter:120});
const h2 = t => para(run(t, {bold:true, sz:14, color:'#005599'}), {spaceAfter:80});
const h3 = t => para(run(t, {bold:true, sz:12, color:'#0077AA'}), {spaceAfter:60});
const p  = (t, indent=0) => para(run(t, {sz:11}), {spaceAfter:60, indent});
const pCode = t => para(run(t, {sz:10, font:'Courier New', color:'#003300'}),
                        {spaceAfter:20, indent:360, shading:'#F0F4F0'});
const pEmpty = () => '<w:p><w:r><w:t></w:t></w:r></w:p>';

function tableRow(cells, headerBg) {
  return `<w:tr>${cells.map(c => `<w:tc>
    <w:tcPr><w:tcW w:w="0" w:type="auto"/>${headerBg?`<w:shd w:val="clear" w:color="auto" w:fill="${headerBg.replace('#','')}"/>`:''}
    <w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar>
    </w:tcPr>
    <w:p><w:r><w:rPr>${headerBg?'<w:b/><w:bCs/>':''}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${esc(c)}</w:t></w:r></w:p>
  </w:tc>`).join('')}</w:tr>`;
}

function table(rows) {
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
    </w:tblPr>
    ${tableRow(header,'#D0E8F5')}
    ${body.map(r=>tableRow(r)).join('\n')}
  </w:tbl>`;
}

// ── document body ─────────────────────────────────────────────────────────────
function buildBody() {
  const parts = [];

  // Cover
  parts.push(para(run('TRANSMISSION HOLOGRAMMA', {bold:true, sz:24, color:'#003366'}), {center:true, spaceAfter:120}));
  parts.push(para(run('Algoritm va Arxitektura — To\'liq Texnik Hujjat', {bold:true, sz:15, color:'#005599'}), {center:true, spaceAfter:80}));
  parts.push(para(run('Interaktiv ta\'lim platformasi | Next.js 16 · React 19 · Three.js · Canvas 2D', {italic:true, sz:11, color:'#666666'}), {center:true, spaceAfter:60}));
  parts.push(para(run('2026-yil | Transmission Hologramma loyihasi', {italic:true, sz:10, color:'#999999'}), {center:true, spaceAfter:240}));
  parts.push(pEmpty());

  // §1
  parts.push(h1('§1. Ilovaning umumiy tuzilmasi (Arxitektura)'));
  parts.push(p('Ushbu platforma Next.js 16 (App Router) va React 19 asosida qurilgan to\'liq mijoz tomonidagi interaktiv ilova bo\'lib, 11 ta bo\'limdan iborat. Ilova hech qanday backend yoki ma\'lumotlar bazasisiz ishlaydi — barcha hisob-kitoblar foydalanuvchi brauzerida real vaqtda amalga oshiriladi.'));
  parts.push(pEmpty());
  parts.push(h3('Asosiy texnologiyalar:'));
  parts.push(p('• Next.js 16 — App Router, Turbopack, server-side rendering → client hydration'));
  parts.push(p('• React 19 — Hooks: useState, useEffect, useRef, useMemo'));
  parts.push(p('• Three.js — WebGL orqali 3D vizualizatsiya (ReconstructionSim, FractalCNN)'));
  parts.push(p('• Canvas 2D API — Optik stol, matematika kalkulyatori, yozish animatsiyasi'));
  parts.push(p('• TypeScript — To\'liq tiplanganlik, xavfsiz ma\'lumotlar tuzilmalari'));
  parts.push(p('• CSS o\'zgaruvchilar — qorang\'i/yorug\' mavzu, var(--bg-primary) va h.k.'));
  parts.push(p('• i18n — useLang() hook, translations.ts fayli, Lang = "ru" | "uz"'));
  parts.push(pEmpty());
  parts.push(h3('Bo\'limlar ro\'yxati:'));
  parts.push(table([
    ['#',  'Bo\'lim nomi',       'Asosiy texnologiya',   'Maqsad'],
    ['0',  'Jihozlar',           'React JSX',            '8 ta golografik asbob-uskuna tavsifi'],
    ['1',  'Optik sxema',        'SVG inline',           'Qurilmaning interaktiv diagrammasi'],
    ['2',  'Yozish',             'Canvas 2D + animatsiya','Gologramma yozish jarayoni animatsiyasi'],
    ['3',  'Matematika',         'Canvas 2D + formulalar','Interaktiv kalkulyator va 8 ta formula'],
    ['4',  'Tiklash',            'SVG + CSS animatsiya', 'Difraksiya fizikasi ko\'rsatmasi'],
    ['5',  'Bo\'lak = Butun',    'Canvas 2D fraktal',    'Gologramma o\'z-o\'ziga o\'xshashlik xususiyati'],
    ['6',  'Taqqoslash',         'React tablolar',       'Transmissiya vs Refleksiya tahlili'],
    ['7',  'Optik stol',         'Canvas 2D + nur kuzatish','Interaktiv nur kuzatish konstruktori'],
    ['8',  'Simulyator',         'Three.js WebGL',       '3D tiklash simulyatori'],
    ['9',  '2D → 3D',            'Three.js + ray marching','Mandelbulb + CNN chuqurlik modeli'],
    ['10', 'Algoritm',           'SVG + React tablolar', 'Arxitektura, algoritmlar, taqqoslash'],
  ]));
  parts.push(pEmpty());

  // §2
  parts.push(h1('§2. Gologramma Yozish Algoritmi'));
  parts.push(p('Transmissiya gologrammasini yozish — ikki koherent lazer nurini optik plyonkada uchrashtirish jarayonidir. Ushbu jarayon quyidagi ketma-ket bosqichlardan iborat:'));
  parts.push(pEmpty());

  parts.push(h3('1-bosqich: Lazer nuri hosil qilish'));
  parts.push(pCode('E_r = A_r · exp(i·k·r)'));
  parts.push(p('A_r — amplituda, k = 2π/λ — to\'lqin soni, r — koordinata. He-Ne lazer uchun λ = 632.8 nm. Koherentlik uzunligi: Lc = λ²/Δλ ≈ 30 sm. Bu — ikki nurning optik yo\'l farqi shu qiymatdan oshmasligi kerakligini bildiradi.'));

  parts.push(h3('2-bosqich: Nur bo\'lgich (Beam Splitter)'));
  parts.push(p('Yarim shaffof ko\'zgu nurnni 50/50 nisbatida ikki qismga bo\'ladi: tayanch nuri (reference beam) — to\'g\'ridan-to\'g\'ri plyonkaga, ob\'ekt nuri (object beam) — ob\'ektga yo\'naltiriladi.'));

  parts.push(h3('3-bosqich: Ob\'ektdan tarqalish'));
  parts.push(pCode('E_0 = A_0 · exp(i·k·r + i·φ(x,y))'));
  parts.push(p('Ob\'ektdan tarqalgan nur φ(x,y,z) faza kechikishini olib boradi — bu 3D shaklning kodlangan tasviridir. Ob\'ektning har bir nuqtasi o\'ziga xos faza qo\'shadi.'));

  parts.push(h3('4-bosqich: Plyonkada interferensiya'));
  parts.push(pCode('I(x,y) = |E_r + E_0|² = A_r² + A_0² + 2·A_r·A_0·cos(φ)'));
  parts.push(p('Interferensiya chizig\'lari davri: d = λ / (2·sin(θ/2)). θ = 30° va λ = 632.8 nm uchun: d ≈ 1223 nm = 1.2 mkm. Shu sababli golografik plyonkaning aniqligi 1000–5000 chiziq/mm bo\'lishi kerak.'));

  parts.push(h3('5-bosqich: Plyonka o\'tkazuvchanligi'));
  parts.push(pCode('T(x,y) = T₀ + β · I(x,y)'));
  parts.push(p('T₀ — fon o\'tkazuvchanligi, β — emulsiyaning ekspozitsiyaga sezgirligi. Kimyoviy ishlovdan (rivojlantirish + oqartirish) so\'ng gologramma tayyor bo\'ladi.'));
  parts.push(pEmpty());

  // §3
  parts.push(h1('§3. Tiklash Algoritmi'));
  parts.push(p('Tayyor gologrammani tayanch lazer nuri bilan yoritganda difraksiya hodisasi yuz beradi. Bragg shartining bajarilishi uchun tiklash to\'lqin uzunligi va burchagi yozish parametrlariga mos kelishi zarur.'));
  parts.push(pEmpty());
  parts.push(pCode('T · E_r = T₀·E_r + β·A_r²·E_r + β·A_r·A_0·exp(iφ) + β·A_r·A_0·exp(-iφ)'));
  parts.push(pEmpty());
  parts.push(table([
    ['Tartib',         'Ifoda',                        'Tavsif'],
    ['0-chi (fon)',    'T₀·E_r + β·A_r²·E_r',          'To\'g\'ri nur — ob\'ekt ma\'lumoti yo\'q'],
    ['+1-chi (3D)',    'β·A_r·A_0·exp(iφ)',             'Tiklangan ob\'ekt to\'lqini — virtual 3D tasvir!'],
    ['-1-chi (teskari)','β·A_r·A_0·exp(-iφ)',           'Bog\'liq to\'lqin — psevdoskopik (teskari) tasvir'],
  ]));
  parts.push(pEmpty());
  parts.push(p('Muhim shart: agar λ_tiklash ≠ λ_yozish yoki θ_tiklash ≠ θ_yozish bo\'lsa, +1-chi tartib zaiflashadi va tasvir loyqa bo\'ladi. Simulyatorda bu hodisani slayder yordamida kuzatish mumkin.'));
  parts.push(pEmpty());

  // §4
  parts.push(h1('§4. Nur Kuzatish Algoritmi (OpticalTable)'));
  parts.push(p('Optik stol bo\'limi ilovaning asosiy hisoblash yadrosi hisoblanadi. U 2D Canvas ustida real vaqtda nur kuzatishni amalga oshiradi. Foydalanuvchi komponentlarni joylashtirib, ular orasida nurlar qanday tarqalishini kuzatadi.'));
  parts.push(pEmpty());
  parts.push(h3('Asosiy ma\'lumotlar tuzilmalari:'));
  parts.push(pCode('interface RaySource {'));
  parts.push(pCode('  id: string;'));
  parts.push(pCode('  x, y: number;      // Canvas koordinatalari'));
  parts.push(pCode('  angle: number;     // Yo\'nalish (gradus, 0 = o\'ng)'));
  parts.push(pCode('  color: string;     // CSS rang, masalan "#FF4444"'));
  parts.push(pCode('  skipId?: string;   // BS qayta urilishini oldini olish'));
  parts.push(pCode('}'));
  parts.push(pEmpty());
  parts.push(pCode('interface ComponentDef {'));
  parts.push(pCode('  id: string;'));
  parts.push(pCode("  type: 'laser'|'beamsplitter'|'mirror'|'lens'|'film'|'object';"));
  parts.push(pCode('  x, y: number;'));
  parts.push(pCode('  angle: number;'));
  parts.push(pCode('  width, height: number;'));
  parts.push(pCode('}'));
  parts.push(pEmpty());
  parts.push(h3('Algoritm qadamlari:'));
  parts.push(p('1. Barcha komponentlar orasidan "laser" tipidagi komponent topiladi.'));
  parts.push(p('2. Lazerdan dastlabki nur chiqariladi (RaySource ob\'ekti yaratiladi).'));
  parts.push(p('3. Har bir nur uchun eng yaqin komponent AABB (Axis-Aligned Bounding Box) tekshiruvi orqali aniqlanadi.'));
  parts.push(p('4. Komponent turiga qarab amal bajariladi:'));
  parts.push(p('   • Beam Splitter: 2 ta yangi nur (tayanch + ob\'ekt) chiqariladi; skipId o\'rnatiladi.', 360));
  parts.push(p('   • Ko\'zgu: Snell qonuni bo\'yicha nur qaytariladi (angle = 180 - angle).', 360));
  parts.push(p('   • Linza: Nur yo\'nalishi o\'zgartiriladi (sinish effekti simulyatsiyasi).', 360));
  parts.push(p('   • Plyonka: Urilish qayd etiladi; tayanch va ob\'ekt nurlari uchrashsa — interferensiya aniqlanadi.', 360));
  parts.push(p('   • Ob\'ekt: Tarqalgan nurlar turli burchaklarda chiqariladi.', 360));
  parts.push(p('5. 100 qadam chegarasiga yetguncha yoki barcha nurlar qurilmadan chiqib ketguncha takrorlanadi.'));
  parts.push(pEmpty());
  parts.push(p('skipId mexanizmi: Beam Splitter chiqargan nurlar shu BS id\'ini "skipId" sifatida olib yuradi. Keyingi qadam da shu komponent o\'tkazib yuboriladi. Bu kaskadli qayta urilish (infinite loop) muammosini hal etadi.'));
  parts.push(pEmpty());

  // §5
  parts.push(h1('§5. Golografiya Usullari — Miqdoriy Taqqoslash (1–10)'));
  parts.push(p('Har bir mezon 1 dan 10 gacha baholanadi (10 = eng yaxshi natija):'));
  parts.push(pEmpty());
  parts.push(table([
    ['Usul',                           'Aniqlik','Yozish','Lazersiz','Rang','3D','Ilmiy','Jami/60'],
    ['Transmissiya (Leyt–Upatnieks)',  '9',     '7',    '2',      '3',  '9', '10',  '40'],
    ['Aks ettiruvchi (Denisyuk)',      '7',     '6',    '10',     '8',  '8', '8',   '47'],
    ['Kamalak (Benton)',               '7',     '5',    '8',      '6',  '4', '6',   '36'],
    ['Gabor (inline)',                 '6',     '9',    '5',      '3',  '3', '7',   '33'],
  ]));
  parts.push(pEmpty());
  parts.push(p('Xulosa: Aks ettiruvchi Denisyuk gologrammasi oq yorug\'likda ko\'rish imkoniyati tufayli amaliy qo\'llash bo\'yicha yetakchi (47/60, 78%). Transmissiya gologramma esa ilmiy tadqiqotlar va yuqori aniqlik talab qilinadigan holatlarda ustunlik qiladi (40/60, 67%).'));
  parts.push(pEmpty());

  // §6
  parts.push(h1('§6. Lazerlar Taqqoslamasi (1–10)'));
  parts.push(table([
    ['Lazer',     'λ (nm)', 'Koherentlik','Quvvat','Narx','Mavjudlik','Barqarorlik','Jami/50'],
    ['He-Ne',     '632.8',  '10',        '5',    '4',  '7',       '10',         '36'],
    ['Nd:YAG×2',  '532',    '8',         '8',    '7',  '9',       '8',          '40 ★'],
    ['Ar⁺',       '488',    '9',         '9',    '2',  '4',       '7',          '31'],
    ['Diod 405nm','405',    '6',         '6',    '9',  '9',       '6',          '36'],
  ]));
  parts.push(pEmpty());
  parts.push(p('★ Nd:YAG×2 (532 nm, yashil) — yangi boshlovchilar uchun eng yaxshi tanlov: yashil lazer ko\'rsatgichlari arzon ($10 dan), keng tarqalgan va barqaror. He-Ne lazer esa eng yuqori barqarorlik va koherentlikka ega, lekin narxi yuqori ($50–200).'));
  parts.push(pEmpty());

  // §7
  parts.push(h1('§7. Qo\'shimcha Ma\'lumot (faqat O\'zbekcha)'));

  parts.push(h2('7.1. Golografiyaning qisqacha tarixi'));
  parts.push(table([
    ['Yil',     'Voqea'],
    ['1947',    'Dennis Gabor interferensiyasiz ko\'rish printsipini kashf etdi — golografiyaning poydevori'],
    ['1960',    'Lazer ixtiro qilindi — koherent nur manbasiga ega bo\'lindi'],
    ['1962',    'Emmet Leith va Juris Upatnieks birinchi yuqori sifatli transmissiya gologrammasini yaratdi'],
    ['1962',    'Yuri Denisyuk oq yorug\'likda ko\'rinadigan refleksiya gologrammasini ishlab chiqdi'],
    ['1971',    'Dennis Gabor fizika bo\'yicha Nobel mukofotiga sazovor bo\'ldi'],
    ['1980-lar','Kamalak gologrammalar kredit kartalarda qo\'llanila boshladi'],
    ['2000-lar','Raqamli golografiya va kompyuter yordamida hologram generatsiyasi rivojlandi'],
    ['Hozir',   'Holografik ko\'rsatish, tibbiyot, ma\'lumot saqlash va AR/VR sohasida qo\'llaniladi'],
  ]));
  parts.push(pEmpty());

  parts.push(h2('7.2. Hozirgi qo\'llanishlar'));
  parts.push(table([
    ['Soha',              'Misol qo\'llanishlar'],
    ['Xavfsizlik',        'Banknotalar, pasportlar, kredit kartalar, guvohnomalar'],
    ['Tibbiyot',          '3D anatomik modellar, jarrohlik rejalashtiruvi, MRI hologrammalari'],
    ['Sanoat',            'Sirt tekshiruvi, holografik interferometriya, o\'lchash tizimlari'],
    ['Ma\'lumot saqlash', '1 sm³ hajmda terabaytlab axborot saqlash (eksperimental)'],
    ['Reklama va san\'at','Ko\'rgazma eksponatlari, 3D vitrinalar, Tupak Shakur konsert'],
    ['Mudofaa va aviatsiya','HUD (Head-Up Display) uchun pilotlar va askarlar'],
    ['Ta\'lim',           'Interaktiv 3D o\'quv materiallari — xuddi ushbu platforma kabi!'],
  ]));
  parts.push(pEmpty());

  parts.push(h2('7.3. Amaliy maslahatlar (mahalliy sharoit uchun)'));
  parts.push(p('Gologramma yozish uchun eng muhim shart — tebranishlarni kamaytirish (vibroizolyatsiya).'));
  parts.push(p('• Maxsus pnevmatik stol yo\'q bo\'lsa: qum to\'ldirilgan og\'ir quti (200–300 kg) — arzon va samarali variant.', 360));
  parts.push(p('• Muqobil: Shishirilgan avtomobil kameralari ustiga o\'rnatilgan og\'ir metall plita.', 360));
  parts.push(p('• Tunda, transport kamligi vaqtida ishlang — yer tebranishlari sezilarli kamayadi.', 360));
  parts.push(p('• Ekspozitsiya vaqtida xonadan chiqib keting va eshiqni yopmay qoldiring.', 360));
  parts.push(p('• Xona harorati ekspozitsiya davomida o\'zgarmasligi kerak — konditsioner va shamollatgichlarni o\'chiring.', 360));
  parts.push(p('• Golografik plyonka o\'rniga Foma Holotest fotografik plyonkasi ham ishlatilishi mumkin (kamroq aniqlik, lekin arzon).', 360));
  parts.push(pEmpty());

  parts.push(h2('7.4. Asosiy formulalar — tez manba'));
  parts.push(table([
    ['Formula',                           'Belgilar',                          'Maqsad'],
    ['d = λ / (2·sin(θ/2))',             'd=chiziq davri, λ=to\'lqin, θ=burchak','Interferensiya chiziq davrini hisoblash'],
    ['N = 10⁶ / d',                      'N=chiziq/mm, d=nm da',              'Plyonkaning kerakli aniqligi'],
    ['Lc = λ² / Δλ',                    'Lc=koherentlik uzunligi',            'Optik yo\'llar farqining chegarasi'],
    ['α = arcsin(λ/d)',                  'α=difraksiya burchagi',              'Tiklanganda nur chiqish burchagi'],
    ['I = Ar² + A0² + 2·Ar·A0·cos(φ)', 'I=intensivlik',                     'Plyonkadagi interferensiya intensivligi'],
    ['T(x,y) = T₀ + β·I(x,y)',         'β=sezgirlik, T₀=fon',               'Plyonkaning o\'tkazuvchanlik profili'],
  ]));
  parts.push(pEmpty());

  parts.push(h2('7.5. Atamalar lug\'ati'));
  parts.push(table([
    ["O'zbekcha",           'Ruscha',              'Inglizcha'],
    ['Gologramma',          'Голограмма',           'Hologram'],
    ['Tayanch nuri',        'Опорный луч',          'Reference beam'],
    ["Ob'ekt nuri",         'Объектный луч',        'Object beam'],
    ["Nur bo'lgich",        'Светоделитель',        'Beam splitter'],
    ["Ko'zgu",              'Зеркало',              'Mirror'],
    ['Linza',               'Линза',                'Lens'],
    ['Plyonka',             'Плёнка',               'Photosensitive film'],
    ['Interferensiya',      'Интерференция',        'Interference'],
    ['Difraksiya',          'Дифракция',            'Diffraction'],
    ['Koherentlik',         'Когерентность',        'Coherence'],
    ["To'lqin uzunligi",    'Длина волны',          'Wavelength'],
    ['Tiklash',             'Восстановление',       'Reconstruction'],
    ['Tebranishdan himoya', 'Виброизоляция',        'Vibration isolation'],
    ['Fotorezist',          'Фоторезист',           'Photoresist'],
    ["Holografik panjara",  'Голографическая решётка','Holographic grating'],
  ]));
  parts.push(pEmpty());

  // Footer
  parts.push(para(
    run('Ushbu hujjat Transmission Hologramma interaktiv ta\'lim platformasidan avtomatik generatsiya qilingan. 2026-yil.', {italic:true, sz:9, color:'#999999'}),
    {center:true, spaceAfter:0}
  ));

  return parts.join('\n');
}

// ── DOCX package ──────────────────────────────────────────────────────────────
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

function buildDocumentXml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1800"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

async function main() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file('word/_rels/document.xml.rels', WORD_RELS);
  zip.file('word/document.xml', buildDocumentXml(buildBody()));

  const buf = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const outPath = path.join(__dirname, '..', 'transmission-hologramma-algoritm.docx');
  fs.writeFileSync(outPath, buf);
  console.log('Saved:', outPath);
}

main().catch(err => { console.error(err); process.exit(1); });
