import JSZip from 'jszip';
import type { NormalizedFileEntry, ZipAnalysisResult } from '../types/apk';

const TEXT_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'json', 'svg', 'txt', 'xml', 'webmanifest',
]);

function getExtension(path: string): string {
  const base = path.split('/').pop() ?? '';
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : '';
}

function isIgnoredEntry(path: string): boolean {
  return (
    path.startsWith('__MACOSX/') ||
    path.includes('/__MACOSX/') ||
    path.startsWith('node_modules/') ||
    path.includes('/node_modules/') ||
    path.startsWith('.git/') ||
    path.includes('/.git/') ||
    path.endsWith('.DS_Store') ||
    path.endsWith('Thumbs.db')
  );
}

export function rewriteHtmlPaths(html: string): { content: string; rewritten: boolean } {
  let updated = html;
  // Convert root-relative src="/..." or href="/..." (excluding protocol-relative //) to ./
  updated = updated.replace(
    /(\b(?:src|href|poster|data-src)=["'])\/(?!\/)/gi,
    '$1./'
  );
  // Remove restrictive <base href="/"> if present
  updated = updated.replace(/<base\s+href=["']\/["']\s*\/?>/gi, '<base href="./" />');
  return {
    content: updated,
    rewritten: updated !== html,
  };
}

export function rewriteCssPaths(css: string): { content: string; rewritten: boolean } {
  const updated = css.replace(/url\(\s*(["']?)\/(?!\/)/gi, 'url($1./');
  return {
    content: updated,
    rewritten: updated !== css,
  };
}

export function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const cleaned = match[1].replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function pickBestIndexHtmlPath(
  filePaths: string[],
  readTextByPath?: (p: string) => string | undefined
): string | null {
  const candidates = filePaths
    .filter((p) => !isIgnoredEntry(p))
    .filter((p) => p === 'index.html' || p.endsWith('/index.html'))
    .sort((a, b) => a.split('/').length - b.split('/').length);

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // If a built dist/index.html or build/index.html exists and shallowest index.html points to /src/main, prefer built output
  const shallowest = candidates[0];
  const shallowText = readTextByPath?.(shallowest);
  const builtCandidate = candidates.find(
    (p) => /(?:^|\/)(?:dist|build|out)\/index\.html$/i.test(p)
  );
  if (builtCandidate && shallowText && /\/src\/main\.(?:t|j)sx?/i.test(shallowText)) {
    return builtCandidate;
  }
  return shallowest;
}

function detectPackageBuildScript(packageJsonRaw: string | undefined): {
  hasBuildScript: boolean;
  pkgName: string | null;
} {
  if (!packageJsonRaw) return { hasBuildScript: false, pkgName: null };
  try {
    const parsed = JSON.parse(packageJsonRaw) as {
      name?: unknown;
      scripts?: Record<string, unknown>;
    };
    const hasBuildScript = Boolean(
      parsed.scripts &&
        typeof parsed.scripts.build === 'string' &&
        parsed.scripts.build.trim().length > 0
    );
    const pkgName = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null;
    return { hasBuildScript, pkgName };
  } catch {
    return { hasBuildScript: false, pkgName: null };
  }
}

export async function analyzeAndNormalizeZip(
  fileData: ArrayBuffer | Uint8Array,
  fileName: string
): Promise<ZipAnalysisResult> {
  const zip = await JSZip.loadAsync(fileData);
  const allFilePaths: string[] = [];

  zip.forEach((relativePath, entry) => {
    if (!entry.dir && !isIgnoredEntry(relativePath)) {
      allFilePaths.push(relativePath);
    }
  });

  if (allFilePaths.length === 0) {
    throw new Error('الملف المضغوط فارغ ولا يحتوي على أي ملفات.');
  }

  // Read index.html candidates first to inspect if Vite source vs dist exists
  const indexCandidates = allFilePaths.filter(
    (p) => p === 'index.html' || p.endsWith('/index.html')
  );
  const indexTexts = new Map<string, string>();
  for (const candidate of indexCandidates) {
    const obj = zip.file(candidate);
    if (obj) {
      indexTexts.set(candidate, await obj.async('string'));
    }
  }

  // Also detect package.json at project root or top folder (for React/Vite/TS source projects where index.html might be in public/ or src/)
  let discoveredIndexPath = pickBestIndexHtmlPath(allFilePaths, (p) => indexTexts.get(p));
  let pkgCheckPath = discoveredIndexPath
    ? `${discoveredIndexPath.includes('/') ? discoveredIndexPath.slice(0, discoveredIndexPath.lastIndexOf('/') + 1) : ''}package.json`
    : 'package.json';

  if (!discoveredIndexPath) {
    // Check if it's a Next.js / React source project with package.json (having scripts.build) even if index.html is inside src/ or public/
    const pkgCandidates = allFilePaths
      .filter((p) => p === 'package.json' || p.endsWith('/package.json'))
      .sort((a, b) => a.split('/').length - b.split('/').length);
    if (pkgCandidates.length > 0) {
      pkgCheckPath = pkgCandidates[0];
      const pkgText = await zip.file(pkgCheckPath)?.async('string');
      const info = detectPackageBuildScript(pkgText);
      if (info.hasBuildScript) {
        discoveredIndexPath = pkgCheckPath;
      }
    }
  }

  if (!discoveredIndexPath) {
    throw new Error('لم يتم العثور على ملف index.html أو package.json قابل للبناء داخل الأرشيف المضغوط.');
  }

  const lastSlash = discoveredIndexPath.lastIndexOf('/');
  const strippedPrefix = lastSlash >= 0 ? discoveredIndexPath.slice(0, lastSlash + 1) : '';
  const wasReorganized = strippedPrefix.length > 0;

  const rootPkgObj = zip.file(`${strippedPrefix}package.json`);
  const rootPkgRaw = rootPkgObj ? await rootPkgObj.async('string') : undefined;
  const { hasBuildScript, pkgName } = detectPackageBuildScript(rootPkgRaw);
  const projectKind: 'static' | 'vite-react' = hasBuildScript ? 'vite-react' : 'static';

  const entries: NormalizedFileEntry[] = [];
  const normalizedFiles: Record<string, Uint8Array | string> = {};
  let totalBytes = 0;
  let rewrittenFilesCount = 0;
  let detectedTitle: string | null = null;

  for (const origPath of allFilePaths) {
    // Only keep files that live inside the discovered root prefix
    if (strippedPrefix && !origPath.startsWith(strippedPrefix)) {
      continue;
    }

    const normPath = strippedPrefix ? origPath.slice(strippedPrefix.length) : origPath;
    if (!normPath) continue;

    const zipObj = zip.file(origPath);
    if (!zipObj) continue;

    const ext = getExtension(normPath);
    let rewritten = false;
    let payload: Uint8Array | string;

    if (TEXT_EXTENSIONS.has(ext)) {
      let text = await zipObj.async('string');
      if (normPath === 'index.html' || normPath === 'src/entry.html' || normPath === 'public/index.html') {
        detectedTitle = detectedTitle || extractHtmlTitle(text);
        if (!hasBuildScript && normPath === 'index.html') {
          const res = rewriteHtmlPaths(text);
          text = res.content;
          rewritten = res.rewritten;
        }
      } else if (!hasBuildScript && ext === 'css') {
        const res = rewriteCssPaths(text);
        text = res.content;
        rewritten = res.rewritten;
      }
      if (rewritten) rewrittenFilesCount += 1;
      payload = text;
      const byteLen = new TextEncoder().encode(text).byteLength;
      totalBytes += byteLen;
      entries.push({
        originalPath: origPath,
        normalizedPath: normPath,
        sizeBytes: byteLen,
        isDirectory: false,
        rewritten,
      });
    } else {
      const bin = await zipObj.async('uint8array');
      payload = bin;
      totalBytes += bin.byteLength;
      entries.push({
        originalPath: origPath,
        normalizedPath: normPath,
        sizeBytes: bin.byteLength,
        isDirectory: false,
        rewritten: false,
      });
    }

    normalizedFiles[normPath] = payload;
  }

  if (!detectedTitle && pkgName) {
    detectedTitle = pkgName;
  }

  entries.sort((a, b) => a.normalizedPath.localeCompare(b.normalizedPath));

  return {
    fileName,
    totalBytes,
    fileCount: entries.length,
    discoveredIndexPath,
    strippedPrefix,
    wasReorganized,
    rewrittenFilesCount,
    projectKind,
    hasBuildScript,
    entries,
    normalizedFiles,
    detectedTitle,
  };
}

/**
 * Generates a realistic nested sample AI Studio export ZIP (`sample-project/dist/index.html`)
 * so users can immediately test automatic subfolder reorganization, path rewriting, and APK building.
 */
export async function createSampleProjectZip(): Promise<{ buffer: Uint8Array; fileName: string }> {
  const zip = new JSZip();
  const root = 'quran-tasmee-studio/dist';

  zip.file(
    `${root}/index.html`,
    `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>رفيق التلاوة والحفظ</title>
    <link rel="stylesheet" href="/assets/style.css" />
  </head>
  <body>
    <main class="card">
      <h1>رفيق التلاوة والحفظ</h1>
      <p>تطبيق نموذجي يدعم حفظ بطاقات الآيات كصور والمشاركة والتسميع الصوتي.</p>
      <button id="save-btn">حفظ البطاقة</button>
      <button id="share-btn">مشاركة</button>
    </main>
    <script src="/assets/app.js"><${'/'}script>
  </body>
</html>`
  );

  zip.file(
    `${root}/assets/style.css`,
    `body { font-family: sans-serif; background: #f8fafc url('/assets/bg-pattern.svg'); margin: 0; padding: 24px; }
.card { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 24px; }`
  );

  zip.file(
    `${root}/assets/app.js`,
    `console.log('Sample AI Studio Web App initialized');`
  );

  zip.file(
    `${root}/assets/bg-pattern.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="2" fill="#e2e8f0"/></svg>`
  );

  const buffer = await zip.generateAsync({ type: 'uint8array' });
  return { buffer, fileName: 'quran-tasmee-studio.zip' };
}
