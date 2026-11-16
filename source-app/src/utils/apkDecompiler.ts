import JSZip from 'jszip';
import type { ApkInspectionEntry, ApkInspectionResult } from '../types/apk';
import { extractHtmlTitle } from './zipAnalyzer';

function sanitizeZipBaseName(fileName: string): string {
  const withoutExt = fileName.replace(/\.apk$/i, '').trim();
  const cleaned = withoutExt.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
  return cleaned || 'app_source';
}

function findEntryCaseInsensitive(paths: string[], targetLower: string): string | undefined {
  return paths.find((p) => p.toLowerCase() === targetLower);
}

/**
 * Inspects an uploaded .apk archive locally using JSZip:
 * - Case A: Detects Capacitor / Cordova / Hybrid WebView apps via assets/public/index.html or assets/www/index.html,
 *   extracts all web files cleanly with index.html at root into a ready-to-edit .zip Blob.
 * - Case B: Detects Native Java/Kotlin Android apps via classes*.dex for cloud JADX decompilation.
 */
export async function inspectAndExtractApk(
  apkData: ArrayBuffer | Uint8Array,
  fileName: string
): Promise<ApkInspectionResult> {
  const rawBytes = apkData instanceof Uint8Array ? apkData : new Uint8Array(apkData);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(rawBytes);
  } catch {
    throw new Error('تعذر فتح الملف؛ تأكد من أن الملف بصيغة APK صالحة وغير تالفة.');
  }

  const allEntries: Array<{ path: string; obj: JSZip.JSZipObject }> = [];
  zip.forEach((relPath, entry) => {
    if (!entry.dir) {
      allEntries.push({ path: relPath, obj: entry });
    }
  });

  if (allEntries.length === 0) {
    throw new Error('ملف APK فارغ ولا يحتوي على أي بيانات.');
  }

  const allPaths = allEntries.map((e) => e.path);
  const baseName = sanitizeZipBaseName(fileName);

  // Case A detection: assets/public/index.html or assets/www/index.html
  const publicIndex = findEntryCaseInsensitive(allPaths, 'assets/public/index.html');
  const wwwIndex = findEntryCaseInsensitive(allPaths, 'assets/www/index.html');
  const matchedIndex = publicIndex || wwwIndex;

  if (matchedIndex) {
    const prefixLen = publicIndex ? 'assets/public/'.length : 'assets/www/'.length;
    const webRootPrefix = matchedIndex.slice(0, prefixLen);
    const frameworkLabel = publicIndex
      ? 'Capacitor / WebView الهجين'
      : 'Cordova / HTML WebView الهجين';

    let detectedAppName = fileName.replace(/\.apk$/i, '').trim() || 'Hybrid Web App';
    let detectedPackageId: string | null = null;

    // Try reading capacitor.config.json if present inside assets/public or assets
    const capCfgPath =
      findEntryCaseInsensitive(allPaths, `${webRootPrefix.toLowerCase()}capacitor.config.json`) ||
      findEntryCaseInsensitive(allPaths, 'assets/capacitor.config.json');
    if (capCfgPath) {
      try {
        const cfgText = await zip.file(capCfgPath)?.async('string');
        if (cfgText) {
          const parsed = JSON.parse(cfgText) as { appName?: unknown; appId?: unknown };
          if (typeof parsed.appName === 'string' && parsed.appName.trim()) {
            detectedAppName = parsed.appName.trim();
          }
          if (typeof parsed.appId === 'string' && parsed.appId.trim()) {
            detectedPackageId = parsed.appId.trim();
          }
        }
      } catch {
        // ignore invalid json
      }
    }

    // Try reading <title> from index.html as fallback or refinement
    const indexHtmlText = await zip.file(matchedIndex)?.async('string');
    if (indexHtmlText) {
      const title = extractHtmlTitle(indexHtmlText);
      if (title && detectedAppName === fileName.replace(/\.apk$/i, '').trim()) {
        detectedAppName = title;
      }
    }

    // Extract & repack all files under assets/public/ or assets/www/ so index.html sits directly at root
    const outZip = new JSZip();
    const sampleEntries: ApkInspectionEntry[] = [];
    let extractedFilesCount = 0;

    for (const item of allEntries) {
      if (!item.path.toLowerCase().startsWith(webRootPrefix.toLowerCase())) continue;
      const relOutPath = item.path.slice(prefixLen);
      if (!relOutPath) continue;

      const bytes = await item.obj.async('uint8array');
      outZip.file(relOutPath, bytes);
      extractedFilesCount += 1;
      sampleEntries.push({ path: relOutPath, sizeBytes: bytes.byteLength });
    }

    sampleEntries.sort((a, b) => a.path.localeCompare(b.path));
    const extractedZipBlob = await outZip.generateAsync({ type: 'blob' });

    return {
      fileName,
      fileSizeBytes: rawBytes.byteLength,
      totalEntriesCount: allEntries.length,
      apkKind: 'web-hybrid',
      frameworkLabel,
      detectedAppName,
      detectedPackageId,
      webRootPrefix,
      extractedFilesCount,
      dexFiles: allPaths.filter((p) => /^classes\d*\.dex$/i.test(p)),
      sampleEntries: sampleEntries.slice(0, 60),
      extractedZipBlob,
      extractedZipFileName: `${baseName}_web_source.zip`,
      rawApkBytes: rawBytes,
    };
  }

  // Case B detection: Native Android APK with classes*.dex
  const dexFiles = allPaths.filter((p) => /^classes\d*\.dex$/i.test(p)).sort();
  if (dexFiles.length > 0) {
    const sampleEntries: ApkInspectionEntry[] = [];
    for (const item of allEntries.slice(0, 40)) {
      const bytes = await item.obj.async('uint8array');
      sampleEntries.push({ path: item.path, sizeBytes: bytes.byteLength });
    }

    return {
      fileName,
      fileSizeBytes: rawBytes.byteLength,
      totalEntriesCount: allEntries.length,
      apkKind: 'native-android',
      frameworkLabel: 'Java / Kotlin Native (أندرويد أصلي)',
      detectedAppName: fileName.replace(/\.apk$/i, '').trim() || 'Android Native App',
      detectedPackageId: null,
      webRootPrefix: null,
      extractedFilesCount: allEntries.length,
      dexFiles,
      sampleEntries,
      extractedZipBlob: null,
      extractedZipFileName: `${baseName}_jadx_source.zip`,
      rawApkBytes: rawBytes,
    };
  }

  throw new Error(
    'لم يتم العثور على تطبيق ويب هجين (assets/public أو assets/www) ولا ملفات Java/Kotlin التنفيذية (classes.dex) داخل هذا الملف.'
  );
}

export function generateJadxDecompileWorkflowYaml(): string {
  return `name: Decompile Android APK with JADX

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

permissions:
  contents: write

env:
  SAFE_ZIP_NAME: "extracted_source.zip"

jobs:
  decompile-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Java JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Install JADX Decompiler
        run: |
          JADX_VERSION="1.5.1"
          wget -q "https://github.com/skylot/jadx/releases/download/v\${JADX_VERSION}/jadx-\${JADX_VERSION}.zip" -O jadx.zip
          unzip -q jadx.zip -d jadx-tool
          chmod +x jadx-tool/bin/jadx

      - name: Decompile APK with JADX
        run: |
          mkdir -p extracted_source/src extracted_source/res
          ./jadx-tool/bin/jadx -d extracted_source -ds extracted_source/src -dr extracted_source/res input/app.apk || true
          if [ -z "$(find extracted_source -type f -print -quit)" ]; then
            echo "ERROR: JADX failed to extract any source files from input/app.apk"
            exit 1
          fi
          mkdir -p release
          cd extracted_source
          zip -rq "../release/$SAFE_ZIP_NAME" .
          cd ..

      - name: Publish Decompiled Source GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: "source-build-\${{ github.run_number }}"
          name: "Decompiled Source (#\${{ github.run_number }})"
          files: "release/\${{ env.SAFE_ZIP_NAME }}"
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Upload Decompiled Source Artifact
        uses: actions/upload-artifact@v4
        with:
          name: extracted-source-zip
          path: release/extracted_source.zip
          if-no-files-found: error
`;
}

export function buildJadxRepoFiles(apkBytes: Uint8Array): Record<string, string | Uint8Array> {
  return {
    'input/app.apk': apkBytes,
    '.github/workflows/decompile.yml': generateJadxDecompileWorkflowYaml(),
  };
}
