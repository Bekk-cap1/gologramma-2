// NOTE: This route reads extension files from the local disk path below.
// It only works when running locally (next dev). On Vercel or any hosted
// environment this path does not exist and the route returns 500.
// The correct cross-platform approach is ExtensionDownload.tsx (frontend ZIP).
import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { readFileSync } from 'fs';
import { join } from 'path';

const EXT_DIR = 'C:\\Users\\Genius\\hologram-pdf-extension';
// Font served from Next.js public/ so it's included in the deployment bundle.
const PUBLIC_DIR = join(process.cwd(), 'public');

export async function GET() {
  try {
    const zip = new JSZip();
    const folder = zip.folder('hologram-extension')!;

    // Read and add all extension files with flat structure
    const files: [string, string | Buffer][] = [
      ['content.js',        readFileSync(join(EXT_DIR, 'content', 'content.js'))],
      ['service-worker.js', readFileSync(join(EXT_DIR, 'background', 'service-worker.js'))],
      ['popup.css',         readFileSync(join(EXT_DIR, 'popup', 'popup.css'))],
      ['popup.js',          readFileSync(join(EXT_DIR, 'popup', 'popup.js'))],
      ['icon-16.svg',       readFileSync(join(EXT_DIR, 'assets', 'icon-16.svg'))],
      ['icon-48.svg',       readFileSync(join(EXT_DIR, 'assets', 'icon-48.svg'))],
      ['icon-128.svg',      readFileSync(join(EXT_DIR, 'assets', 'icon-128.svg'))],
      ['jspdf.umd.min.js',  readFileSync(join(EXT_DIR, 'lib', 'jspdf.umd.min.js'))],
      // Font from public/ so this entry also works on hosting if files are stored there
      ['fonts/NotoSans-Regular.ttf', readFileSync(join(PUBLIC_DIR, 'fonts', 'NotoSans-Regular.ttf'))],
    ];

    // manifest.json — rewritten for flat structure
    const manifest = {
      manifest_version: 3,
      name: "Hologram Calculator — PDF Export",
      description: "Экспорт расчётов transmission голограммы в PDF для диссертации",
      version: "1.0.0",
      permissions: ["activeTab", "storage", "scripting"],
      action: {
        default_popup: "popup.html",
        default_icon: { "16": "icon-16.svg", "48": "icon-48.svg", "128": "icon-128.svg" }
      },
      content_scripts: [{
        matches: ["http://localhost:3100/*", "https://*.vercel.app/*"],
        js: ["content.js"],
        run_at: "document_end"
      }],
      background: { service_worker: "service-worker.js" },
      icons: { "16": "icon-16.svg", "48": "icon-48.svg", "128": "icon-128.svg" }
    };
    folder.file('manifest.json', JSON.stringify(manifest, null, 2));

    // popup.html — read and fix paths to be flat
    let popupHtml = readFileSync(join(EXT_DIR, 'popup', 'popup.html'), 'utf-8');
    popupHtml = popupHtml
      .replace('../lib/jspdf.umd.min.js', 'jspdf.umd.min.js')
      .replace('../assets/icon-48.svg', 'icon-48.svg')
      .replace('popup/popup.css', 'popup.css')
      .replace('href="popup.css"', 'href="popup.css"')  // already flat
      .replace('src="popup.js"', 'src="popup.js"');     // already flat
    folder.file('popup.html', popupHtml);

    // README
    folder.file('README.txt', `Hologram Calculator — PDF Export Extension
==========================================

Установка (Chrome):
1. Распакуйте этот ZIP-архив
2. Откройте chrome://extensions
3. Включите "Режим разработчика" (правый верхний угол)
4. Нажмите "Загрузить распакованное расширение"
5. Выберите папку hologram-extension

Использование:
1. Откройте http://localhost:3100
2. Перейдите на вкладку "Математика"
3. Выставьте параметры λ, θ, Δλ
4. Нажмите иконку расширения → Скачать PDF
`);

    for (const [name, content] of files) {
      folder.file(name, content);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="hologram-pdf-extension.zip"',
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error('ZIP generation error:', err);
    return NextResponse.json({ error: 'Failed to generate ZIP' }, { status: 500 });
  }
}
