import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import {
  computeVersionCode,
  generatePackageName,
  validatePackageName,
  validateVersionName,
} from './packageUtils';
import {
  analyzeAndNormalizeZip,
  createSampleProjectZip,
  extractHtmlTitle,
  rewriteCssPaths,
  rewriteHtmlPaths,
} from './zipAnalyzer';
import {
  buildCapacitorProjectFiles,
  generateAndroidManifestXml,
  generateMainActivityJava,
} from './capacitorGenerator';
import {
  buildJadxRepoFiles,
  generateJadxDecompileWorkflowYaml,
  inspectAndExtractApk,
} from './apkDecompiler';
import { extractJobFailureLogs } from './logParser';
import type { AppConfig } from '../types/apk';

test('generatePackageName transliterates Arabic names cleanly and avoids Java keywords', () => {
  const pkg = generatePackageName('مصحف التلاوة');
  assert.match(pkg, /^com\.apkpro\.[a-z][a-z0-9_]*$/);
  assert.equal(validatePackageName(pkg).valid, true);

  const kwPkg = generatePackageName('class');
  assert.equal(kwPkg, 'com.apkpro.class_app');
  assert.equal(validatePackageName(kwPkg).valid, true);
});

test('validatePackageName rejects invalid identifiers and accepts valid ones', () => {
  assert.equal(validatePackageName('com.myapp.quran').valid, true);
  assert.equal(validatePackageName('com').valid, false);
  assert.equal(validatePackageName('com.123app.test').valid, false);
  assert.equal(validatePackageName('com.my-app.test').valid, false);
  assert.equal(validatePackageName('com.default.app').valid, false);
});

test('validateVersionName and computeVersionCode calculate deterministic codes', () => {
  assert.equal(validateVersionName('1.0.0').valid, true);
  assert.equal(validateVersionName('1.2').valid, false);
  assert.equal(computeVersionCode('1.0.0'), 10000);
  assert.equal(computeVersionCode('2.3.14'), 20314);
});

test('rewriteHtmlPaths and rewriteCssPaths convert root-relative paths while preserving protocol-relative URLs', () => {
  const html = '<script src="/assets/app.js"></script><a href="//cdn.example.com/a.css"></a>';
  const res = rewriteHtmlPaths(html);
  assert.equal(res.rewritten, true);
  assert.match(res.content, /src="\.\/assets\/app\.js"/);
  assert.match(res.content, /href="\/\/cdn\.example\.com\/a\.css"/);

  const css = "body { background: url('/images/bg.png'); }";
  const cssRes = rewriteCssPaths(css);
  assert.equal(cssRes.rewritten, true);
  assert.match(cssRes.content, /url\('\.\/images\/bg\.png'\)/);
});

test('analyzeAndNormalizeZip automatically reorganizes nested subfolder index.html to root', async () => {
  const sample = await createSampleProjectZip();
  const analysis = await analyzeAndNormalizeZip(sample.buffer, sample.fileName);

  assert.equal(analysis.wasReorganized, true);
  assert.equal(analysis.discoveredIndexPath, 'quran-tasmee-studio/dist/index.html');
  assert.equal(analysis.strippedPrefix, 'quran-tasmee-studio/dist/');
  assert.equal(analysis.detectedTitle, 'رفيق التلاوة والحفظ');
  assert.ok('index.html' in analysis.normalizedFiles);
  assert.ok('assets/style.css' in analysis.normalizedFiles);
  assert.equal(analysis.rewrittenFilesCount, 2);

  const normHtml = analysis.normalizedFiles['index.html'] as string;
  assert.match(normHtml, /href="\.\/assets\/style\.css"/);
  assert.match(normHtml, /src="\.\/assets\/app\.js"/);
});

test('analyzeAndNormalizeZip prefers dist/index.html when Vite source index.html coexists', async () => {
  const zip = new JSZip();
  zip.file('my-proj/index.html', '<script type="module" src="/src/main.tsx"></script>');
  zip.file('my-proj/dist/index.html', '<title>Built App</title><script src="/assets/index.js"></script>');
  zip.file('my-proj/dist/assets/index.js', 'console.log(1);');

  const buf = await zip.generateAsync({ type: 'uint8array' });
  const analysis = await analyzeAndNormalizeZip(buf, 'hybrid.zip');

  assert.equal(analysis.discoveredIndexPath, 'my-proj/dist/index.html');
  assert.equal(extractHtmlTitle(analysis.normalizedFiles['index.html'] as string), 'Built App');
});

test('capacitorGenerator generates AndroidManifest, MainActivity, and GitHub Actions workflow matching toggled permissions', async () => {
  const sample = await createSampleProjectZip();
  const analysis = await analyzeAndNormalizeZip(sample.buffer, sample.fileName);

  const config: AppConfig = {
    appName: 'رفيق التلاوة',
    packageName: 'com.myapp.quran',
    versionName: '1.2.3',
    iconDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    permissions: {
      gallerySave: true,
      nativeShare: true,
      microphone: true,
      fullscreen: true,
      orientation: 'portrait',
    },
  };

  const manifest = generateAndroidManifestXml(config);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android\.permission\.ACCESS_NETWORK_STATE/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.match(manifest, /android\.permission\.WRITE_EXTERNAL_STORAGE/);
  assert.match(manifest, /android\.permission\.READ_MEDIA_IMAGES/);
  assert.match(manifest, /android\.permission\.READ_MEDIA_AUDIO/);
  assert.match(manifest, /android\.permission\.VIBRATE/);
  assert.match(manifest, /android\.permission\.WAKE_LOCK/);
  assert.match(manifest, /uses-feature android:name="android\.hardware\.camera" android:required="false"/);
  assert.match(manifest, /android:requestLegacyExternalStorage="true"/);
  assert.match(manifest, /android:screenOrientation="portrait"/);
  assert.match(manifest, /FileProvider/);

  const java = generateMainActivityJava(config);
  assert.match(java, /package com\.myapp\.quran;/);
  assert.match(java, /setAllowFileAccess\(true\)/);
  assert.match(java, /setGeolocationEnabled\(true\)/);
  assert.match(java, /setMediaPlaybackRequiresUserGesture\(false\)/);
  assert.match(java, /saveBase64File/);
  assert.match(java, /shareContent/);
  assert.match(java, /onPermissionRequest/);
  assert.match(java, /onGeolocationPermissionsShowPrompt/);
  assert.match(java, /Manifest\.permission\.CAMERA/);
  assert.match(java, /Manifest\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(java, /configureEdgeToEdgeFullscreen/);

  const files = buildCapacitorProjectFiles(config, analysis);
  assert.ok('www/index.html' in files);
  assert.ok('www/android-native-bridge.js' in files);
  assert.ok('android-overrides/www/android-native-bridge.js' in files);
  assert.ok('app_icon.png' in files);
  assert.ok('capacitor.config.json' in files);
  assert.ok('.github/workflows/build.yml' in files);
  assert.match(files['www/index.html'] as string, /android-native-bridge\.js/);
  assert.match(files['android-overrides/res/xml/file_paths.xml'] as string, /<external-path/);

  const workflow = files['.github/workflows/build.yml'] as string;
  assert.match(workflow, /node-version: '20'/);
  assert.match(workflow, /java-version: '17'/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /Smart Build Web Project/);
  assert.match(workflow, /npm install --legacy-peer-deps/);
  assert.match(workflow, /--base=\.\//);
  assert.doesNotMatch(workflow, /android-actions\/setup-android/);
  assert.doesNotMatch(workflow, /npx cap init/);
  assert.match(workflow, /sdkmanager --licenses/);
  assert.match(workflow, /rm -rf android package\.json package-lock\.json capacitor\.config\.json capacitor\.config\.ts/);
  assert.match(
    workflow,
    /@capacitor\/core@6 @capacitor\/cli@6 @capacitor\/android@6 @capacitor\/filesystem@6 @capacitor\/share@6 @capacitor\/camera@6 @capacitor\/geolocation@6/
  );
  assert.match(workflow, /rm -rf android\/app\/src\/main\/res\/mipmap-anydpi-v26/);
  assert.match(workflow, /hashFiles\('app_icon\.png'\)/);
  assert.match(workflow, /android:requestLegacyExternalStorage="true"/);
  assert.match(workflow, /softprops\/action-gh-release@v2/);
  assert.match(workflow, /capacitor\.config\.json/);
  assert.match(workflow, /npx cap add android/);
  assert.match(workflow, /npx cap sync android/);
  assert.match(workflow, /android\.permission\.CAMERA/);
  assert.match(workflow, /android\.permission\.RECORD_AUDIO/);
  assert.match(workflow, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(workflow, /android\.permission\.WRITE_EXTERNAL_STORAGE/);
  assert.match(workflow, /android\.permission\.READ_MEDIA_IMAGES/);
  assert.match(workflow, /android\.permission\.INTERNET/);
  assert.match(workflow, /\.\/gradlew assembleDebug --stacktrace/);
  assert.match(workflow, /android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
});

test('analyzeAndNormalizeZip detects React/Vite/TypeScript buildable source projects, ignores node_modules, and preserves source-app/', async () => {
  const zip = new JSZip();
  zip.file(
    'my-react-app/package.json',
    JSON.stringify({
      name: 'smart-camera-app',
      scripts: { dev: 'vite', build: 'tsc && vite build' },
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: { vite: '^6.0.0', typescript: '^5.0.0' },
    })
  );
  zip.file(
    'my-react-app/vite.config.ts',
    `import { defineConfig } from 'vite';\nexport default defineConfig({\n  plugins: [],\n});`
  );
  zip.file(
    'my-react-app/index.html',
    `<!doctype html><html><head><title>تطبيق الكاميرا الذكي</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`
  );
  zip.file('my-react-app/src/main.tsx', `console.log('react mount');`);
  zip.file('my-react-app/node_modules/fake/index.js', `should be ignored`);
  zip.file('my-react-app/.git/HEAD', `ref: refs/heads/main`);

  const buf = await zip.generateAsync({ type: 'uint8array' });
  const analysis = await analyzeAndNormalizeZip(buf, 'my-react-app.zip');

  assert.equal(analysis.hasBuildScript, true);
  assert.equal(analysis.projectKind, 'vite-react');
  assert.equal(analysis.detectedTitle, 'تطبيق الكاميرا الذكي');
  assert.ok('package.json' in analysis.normalizedFiles);
  assert.ok('src/main.tsx' in analysis.normalizedFiles);
  assert.equal('node_modules/fake/index.js' in analysis.normalizedFiles, false);
  assert.equal('.git/HEAD' in analysis.normalizedFiles, false);
  // Must NOT rewrite Vite source entry /src/main.tsx
  assert.match(analysis.normalizedFiles['index.html'] as string, /src="\/src\/main\.tsx"/);

  const files = buildCapacitorProjectFiles(
    {
      appName: 'تطبيق الكاميرا الذكي',
      packageName: 'com.myapp.camera',
      versionName: '1.0.0',
      iconDataUrl: null,
      permissions: {
        gallerySave: true,
        nativeShare: true,
        microphone: true,
        fullscreen: false,
        orientation: 'unspecified',
      },
    },
    analysis
  );

  // Source project files placed safely under source-app/ without colliding with root Capacitor package.json
  assert.ok('source-app/package.json' in files);
  assert.ok('source-app/src/main.tsx' in files);
  assert.ok('source-app/vite.config.ts' in files);
  assert.ok('package.json' in files);
  assert.ok('android-overrides/www/android-native-bridge.js' in files);
  assert.equal('www/index.html' in files, false);
  assert.match(files['source-app/package.json'] as string, /vite build/);
  assert.match(files['package.json'] as string, /"@capacitor\/camera"/);

  // Verify the Smart Build bash/JS heredocs inside build.yml parse cleanly
  const yml = files['.github/workflows/build.yml'] as string;
  const vitePatchMatch = yml.match(/node - <<'NODE_VITE'\n([\s\S]*?)\n\s+NODE_VITE/);
  assert.ok(vitePatchMatch, 'NODE_VITE heredoc should exist in build.yml');
  assert.doesNotThrow(() => new Function('require', vitePatchMatch[1]));

  const htmlFixMatch = yml.match(/node - <<'NODE_HTML_FIX'\n([\s\S]*?)\n\s+NODE_HTML_FIX/);
  assert.ok(htmlFixMatch, 'NODE_HTML_FIX heredoc should exist in build.yml');
  assert.doesNotThrow(() => new Function('require', htmlFixMatch[1]));
});

test('extractJobFailureLogs isolates failed step by timestamps and extracts last 25 lines', () => {
  const preLines = [
    '2026-11-15T02:10:01.000Z ##[group]Setup Java JDK 17',
    '2026-11-15T02:10:03.000Z Java 17 ready',
  ];
  const stepLines = Array.from(
    { length: 30 },
    (_, i) => `2026-11-15T02:10:${String(10 + Math.floor(i / 2)).padStart(2, '0')}.${i % 2}00Z step line ${i + 1}`
  );
  stepLines.push('2026-11-15T02:10:26.100Z FAILURE: Build failed with an exception.');
  stepLines.push('2026-11-15T02:10:26.200Z ##[error]Process completed with exit code 1.');
  const postLines = [
    '2026-11-15T02:10:29.000Z ##[group]Post Checkout repository',
    '2026-11-15T02:10:30.000Z Cleaning up orphan processes',
  ];

  const parsed = extractJobFailureLogs([...preLines, ...stepLines, ...postLines].join('\n'), 25, {
    failedStepName: 'Initialize Clean Capacitor Project & Add Android',
    startedAt: '2026-11-15T02:10:10Z',
    completedAt: '2026-11-15T02:10:26Z',
  });

  assert.equal(parsed.tailLines.length, 25);
  assert.match(parsed.headline || '', /FAILURE: Build failed with an exception/);
  assert.equal(parsed.tailLines[0], 'step line 8');
  assert.equal(parsed.tailLines[parsed.tailLines.length - 1], '##[error]Process completed with exit code 1.');
});

test('workflow AndroidManifest injection places permissions before <application without duplicating supportsRtl', () => {
  const sampleManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize"
            android:name=".MainActivity"
            android:exported="true">
        </activity>
    </application>

    <uses-permission android:name="android.permission.INTERNET" />
</manifest>`;

  const config: AppConfig = {
    appName: 'تطبيق تجريبي',
    packageName: 'com.myapp.test',
    versionName: '1.0.0',
    iconDataUrl: null,
    permissions: {
      gallerySave: true,
      nativeShare: true,
      microphone: true,
      fullscreen: true,
      orientation: 'portrait',
    },
  };

  const yaml = buildCapacitorProjectFiles(config, {
    fileName: 'test.zip',
    totalBytes: 100,
    fileCount: 1,
    discoveredIndexPath: 'index.html',
    strippedPrefix: '',
    wasReorganized: false,
    rewrittenFilesCount: 0,
    entries: [],
    detectedTitle: 'Test',
    normalizedFiles: { 'index.html': '<html></html>' },
  })['.github/workflows/build.yml'] as string;

  assert.match(yaml, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
  assert.match(yaml, /if \(!manifest\.includes\('android:supportsRtl'\)\)/);

  // Simulate the exact JS block inside build.yml against Capacitor 6 AndroidManifest.xml
  const match = yaml.match(/node - <<'NODE'\n([\s\S]*?)\n\s+NODE/);
  assert.ok(match, 'Node manifest injection script should exist in workflow');
  const scriptBody = match[1]
    .replace(/^ {10}/gm, '')
    .replace(/const manifestPath = .*;\n/, '')
    .replace(/let manifest = fs\.readFileSync\(.*\);/, 'let manifest = __inputManifest;')
    .replace(/fs\.writeFileSync\(manifestPath, manifest, 'utf8'\);/, '__outputManifest = manifest;')
    .replace(/const gradlePath =[\s\S]*$/, '');

  let outputManifest = '';
  const fn = new Function('require', 'process', '__inputManifest', `${scriptBody}\nreturn __outputManifest;`);
  outputManifest = fn(
    () => ({ join: (...a: string[]) => a.join('/'), readFileSync: () => '', existsSync: () => false, writeFileSync: () => {} }),
    { env: { SCREEN_ORIENTATION: 'portrait', VERSION_CODE: '10000', VERSION_NAME: '1.0.0' } },
    sampleManifest
  );

  // Verify no duplicate android:supportsRtl, android:usesCleartextTraffic, or android:requestLegacyExternalStorage
  assert.equal((outputManifest.match(/android:supportsRtl=/g) || []).length, 1);
  assert.equal((outputManifest.match(/android:usesCleartextTraffic=/g) || []).length, 1);
  assert.equal((outputManifest.match(/android:requestLegacyExternalStorage="true"/g) || []).length, 1);
  assert.equal((outputManifest.match(/android:screenOrientation="portrait"/g) || []).length, 1);
  assert.equal((outputManifest.match(/xmlns:tools="http:\/\/schemas\.android\.com\/tools"/g) || []).length, 1);

  // Verify injected permissions & features appear before <application
  const recordAudioIdx = outputManifest.indexOf('android.permission.RECORD_AUDIO');
  const cameraIdx = outputManifest.indexOf('android.permission.CAMERA');
  const locationIdx = outputManifest.indexOf('android.permission.ACCESS_FINE_LOCATION');
  const cameraFeatureIdx = outputManifest.indexOf('android.hardware.camera');
  const applicationIdx = outputManifest.indexOf('<application');
  assert.ok(recordAudioIdx > 0 && recordAudioIdx < applicationIdx);
  assert.ok(cameraIdx > 0 && cameraIdx < applicationIdx);
  assert.ok(locationIdx > 0 && locationIdx < applicationIdx);
  assert.ok(cameraFeatureIdx > 0 && cameraFeatureIdx < applicationIdx);
});

test('inspectAndExtractApk detects Capacitor/Cordova WebView APKs and extracts clean root ZIP immediately', async () => {
  const apkZip = new JSZip();
  apkZip.file('AndroidManifest.xml', new Uint8Array([3, 0, 8, 0]));
  apkZip.file('classes.dex', new Uint8Array([100, 101, 120]));
  apkZip.file(
    'assets/capacitor.config.json',
    JSON.stringify({ appId: 'com.demo.hybrid', appName: 'المصحف الذكي' })
  );
  apkZip.file(
    'assets/public/index.html',
    '<!doctype html><html><head><title>Web App</title></head><body><h1>Hi</h1></body></html>'
  );
  apkZip.file('assets/public/assets/app.js', 'console.log("ok");');
  apkZip.file('assets/public/assets/style.css', 'body { color: #000; }');

  const apkBytes = await apkZip.generateAsync({ type: 'uint8array' });
  const result = await inspectAndExtractApk(apkBytes, 'AlMushaf.apk');

  assert.equal(result.apkKind, 'web-hybrid');
  assert.equal(result.detectedAppName, 'المصحف الذكي');
  assert.equal(result.detectedPackageId, 'com.demo.hybrid');
  assert.equal(result.webRootPrefix, 'assets/public/');
  assert.equal(result.extractedFilesCount, 3);
  assert.ok(result.extractedZipBlob, 'Should produce extracted .zip Blob locally');

  // Verify extracted .zip places index.html directly at root
  const outBuf = await result.extractedZipBlob!.arrayBuffer();
  const outZip = await JSZip.loadAsync(outBuf);
  assert.ok(outZip.file('index.html'), 'index.html should be at root of extracted ZIP');
  assert.ok(outZip.file('assets/app.js'));
  assert.equal(outZip.file('assets/public/index.html'), null);

  // Also test assets/www/index.html Cordova layout
  const cordovaApk = new JSZip();
  cordovaApk.file('assets/www/index.html', '<title>Cordova Notes</title>');
  cordovaApk.file('assets/www/js/main.js', 'console.log(1);');
  const cordovaBytes = await cordovaApk.generateAsync({ type: 'uint8array' });
  const cordovaRes = await inspectAndExtractApk(cordovaBytes, 'notes.apk');
  assert.equal(cordovaRes.apkKind, 'web-hybrid');
  assert.equal(cordovaRes.detectedAppName, 'Cordova Notes');
  assert.equal(cordovaRes.webRootPrefix, 'assets/www/');
});

test('inspectAndExtractApk detects Native Java/Kotlin APKs via classes.dex and generates valid JADX decompile.yml', async () => {
  const nativeApk = new JSZip();
  nativeApk.file('AndroidManifest.xml', new Uint8Array([3, 0, 8, 0]));
  nativeApk.file('classes.dex', new Uint8Array([1, 2, 3, 4]));
  nativeApk.file('classes2.dex', new Uint8Array([5, 6, 7, 8]));
  nativeApk.file('res/layout/activity_main.xml', '<LinearLayout/>');

  const apkBytes = await nativeApk.generateAsync({ type: 'uint8array' });
  const result = await inspectAndExtractApk(apkBytes, 'NativeScanner.apk');

  assert.equal(result.apkKind, 'native-android');
  assert.equal(result.extractedZipBlob, null);
  assert.deepEqual(result.dexFiles, ['classes.dex', 'classes2.dex']);
  assert.equal(result.detectedAppName, 'NativeScanner');

  const decompileYaml = generateJadxDecompileWorkflowYaml();
  assert.match(decompileYaml, /JADX_VERSION="1\.5\.1"/);
  assert.match(decompileYaml, /jadx-\$\{JADX_VERSION\}\.zip/);
  assert.match(decompileYaml, /jadx -d extracted_source -ds extracted_source\/src -dr extracted_source\/res input\/app\.apk/);
  assert.match(decompileYaml, /softprops\/action-gh-release@v2/);
  assert.match(decompileYaml, /extracted-source-zip/);

  const repoFiles = buildJadxRepoFiles(result.rawApkBytes);
  assert.ok('input/app.apk' in repoFiles);
  assert.ok('.github/workflows/decompile.yml' in repoFiles);
});

test('inspectAndExtractApk throws clear error for archives that contain neither web assets nor classes.dex', async () => {
  const invalidZip = new JSZip();
  invalidZip.file('README.txt', 'not an apk');
  const buf = await invalidZip.generateAsync({ type: 'uint8array' });

  await assert.rejects(() => inspectAndExtractApk(buf, 'broken.apk'), /classes\.dex/);
});

