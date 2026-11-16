import type { AppConfig, ZipAnalysisResult } from '../types/apk';
import { computeVersionCode } from './packageUtils';

export function buildAndroidNativeBridgeJs(config: AppConfig): string {
  const { permissions } = config;
  return `/* Auto-generated Android Native WebView Bridge */
(function () {
  if (typeof window === 'undefined') return;
  var bridge = window.AndroidNativeBridge;

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onloadend = function () {
        resolve(String(reader.result || ''));
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  ${
    permissions.gallerySave
      ? `
  // Intercept blob: and data:image downloads triggered via <a download>
  document.addEventListener('click', function (ev) {
    var anchor = ev.target && ev.target.closest ? ev.target.closest('a[download]') : null;
    if (!anchor || !bridge || typeof bridge.saveBase64File !== 'function') return;
    var href = anchor.getAttribute('href') || '';
    var filename = anchor.getAttribute('download') || ('export_' + Date.now() + '.png');
    if (href.startsWith('data:')) {
      ev.preventDefault();
      var mime = href.split(';')[0].replace('data:', '') || 'image/png';
      bridge.saveBase64File(href, filename, mime);
    } else if (href.startsWith('blob:')) {
      ev.preventDefault();
      fetch(href)
        .then(function (r) { return r.blob(); })
        .then(function (blob) {
          return blobToBase64(blob).then(function (dataUrl) {
            bridge.saveBase64File(dataUrl, filename, blob.type || 'application/octet-stream');
          });
        })
        .catch(function (err) { console.error('Android blob save failed', err); });
    }
  }, true);`
      : ''
  }

  ${
    permissions.nativeShare
      ? `
  // Enhance navigator.share() to bridge directly to Android Intent.ACTION_SEND
  var originalShare = navigator.share ? navigator.share.bind(navigator) : null;
  navigator.share = async function (data) {
    if (bridge && typeof bridge.shareContent === 'function') {
      var title = (data && data.title) ? String(data.title) : document.title;
      var text = (data && (data.text || data.url))
        ? [data.text, data.url].filter(Boolean).join('\\n')
        : '';
      var fileDataUrl = '';
      var mimeType = 'text/plain';
      if (data && data.files && data.files.length > 0) {
        var file = data.files[0];
        mimeType = file.type || 'image/png';
        fileDataUrl = await blobToBase64(file);
      }
      bridge.shareContent(title, text, fileDataUrl, mimeType);
      return;
    }
    if (originalShare) {
      return originalShare(data);
    }
    throw new Error('Share API unavailable');
  };`
      : ''
  }
})();
`;
}

export function injectBridgeIntoIndexHtml(html: string, enabled: boolean): string {
  if (!enabled) return html;
  if (html.includes('android-native-bridge.js')) return html;
  const tag = '<script src="./android-native-bridge.js"><' + '/script>';
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `  ${tag}\n  </head>`);
  }
  return `${tag}\n${html}`;
}

export function generateAndroidManifestXml(config: AppConfig): string {
  const { permissions } = config;
  const permLines: string[] = [
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '    <uses-permission android:name="android.permission.CAMERA" />',
    '    <uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
    '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
    '    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />',
    '    <uses-permission android:name="android.permission.VIBRATE" />',
    '    <uses-permission android:name="android.permission.WAKE_LOCK" />',
    '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
    '    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />',
    '    <uses-feature android:name="android.hardware.microphone" android:required="false" />',
    '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />',
  ];

  const screenOrientationAttr =
    permissions.orientation === 'portrait'
      ? '\n            android:screenOrientation="portrait"'
      : permissions.orientation === 'landscape'
        ? '\n            android:screenOrientation="landscape"'
        : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

${permLines.join('\n')}

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:usesCleartextTraffic="true"
        android:requestLegacyExternalStorage="true"
        android:theme="@style/AppTheme">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"${screenOrientationAttr}
            android:launchMode="singleTask"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>
</manifest>
`;
}

export function generateFilePathsXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="external_storage" path="." />
    <external-files-path name="my_external_files" path="." />
    <external-cache-path name="external_cache" path="." />
    <cache-path name="shared_cache" path="." />
    <files-path name="shared_files" path="." />
</paths>
`;
}

export function generateMainActivityJava(config: AppConfig): string {
  const { packageName, permissions } = config;
  return `package ${packageName};

import android.Manifest;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_CODE = 1042;
    private static final int GEO_PERMISSION_REQUEST_CODE = 1043;
    private PermissionRequest pendingWebPermissionRequest;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ${
          permissions.fullscreen
            ? `configureEdgeToEdgeFullscreen();`
            : `// Standard status bar & navigation bar framing`
        }
        requestRequiredRuntimePermissions();
        configureWebViewCapabilities();
    }

    ${
      permissions.fullscreen
        ? `private void configureEdgeToEdgeFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
            controller.hide(WindowInsetsCompat.Type.systemBars());
        }
    }`
        : ''
    }

    private void addPermissionIfMissing(List<String> needed, String permission) {
        if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
            needed.add(permission);
        }
    }

    private void requestRequiredRuntimePermissions() {
        List<String> needed = new ArrayList<>();
        addPermissionIfMissing(needed, Manifest.permission.CAMERA);
        addPermissionIfMissing(needed, Manifest.permission.RECORD_AUDIO);
        addPermissionIfMissing(needed, Manifest.permission.ACCESS_FINE_LOCATION);
        addPermissionIfMissing(needed, Manifest.permission.ACCESS_COARSE_LOCATION);

        if (Build.VERSION.SDK_INT >= 33) {
            addPermissionIfMissing(needed, Manifest.permission.READ_MEDIA_IMAGES);
            addPermissionIfMissing(needed, Manifest.permission.READ_MEDIA_VIDEO);
            addPermissionIfMissing(needed, Manifest.permission.READ_MEDIA_AUDIO);
        } else {
            addPermissionIfMissing(needed, Manifest.permission.READ_EXTERNAL_STORAGE);
            if (Build.VERSION.SDK_INT <= 29) {
                addPermissionIfMissing(needed, Manifest.permission.WRITE_EXTERNAL_STORAGE);
            }
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    private void configureWebViewCapabilities() {
        if (this.bridge == null || this.bridge.getWebView() == null) return;
        WebView webView = this.bridge.getWebView();
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);

        webView.addJavascriptInterface(new AndroidNativeBridge(), "AndroidNativeBridge");

        webView.setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    List<String> missingPermissions = new ArrayList<>();
                    String[] resources = request.getResources();
                    if (resources != null) {
                        for (String res : resources) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                                        != PackageManager.PERMISSION_GRANTED) {
                                    missingPermissions.add(Manifest.permission.CAMERA);
                                }
                            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                        != PackageManager.PERMISSION_GRANTED) {
                                    missingPermissions.add(Manifest.permission.RECORD_AUDIO);
                                }
                            }
                        }
                    }

                    if (missingPermissions.isEmpty()) {
                        request.grant(resources);
                    } else {
                        pendingWebPermissionRequest = request;
                        ActivityCompat.requestPermissions(
                                MainActivity.this,
                                missingPermissions.toArray(new String[0]),
                                PERMISSION_REQUEST_CODE
                        );
                    }
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(final String origin,
                                                           final GeolocationPermissions.Callback callback) {
                runOnUiThread(() -> {
                    boolean hasFine = ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                            == PackageManager.PERMISSION_GRANTED;
                    boolean hasCoarse = ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_COARSE_LOCATION)
                            == PackageManager.PERMISSION_GRANTED;
                    if (hasFine || hasCoarse) {
                        callback.invoke(origin, true, false);
                    } else {
                        pendingGeoOrigin = origin;
                        pendingGeoCallback = callback;
                        ActivityCompat.requestPermissions(
                                MainActivity.this,
                                new String[]{
                                        Manifest.permission.ACCESS_FINE_LOCATION,
                                        Manifest.permission.ACCESS_COARSE_LOCATION
                                },
                                GEO_PERMISSION_REQUEST_CODE
                        );
                    }
                });
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                if (url == null) return;
                if (url.startsWith("blob:")) {
                    String safeMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "application/octet-stream";
                    String js = "fetch('" + url + "').then(r=>r.blob()).then(b=>{"
                            + "var fr=new FileReader();"
                            + "fr.onloadend=()=>window.AndroidNativeBridge.saveBase64File(fr.result,'download_' + Date.now(),b.type||'" + safeMime + "');"
                            + "fr.readAsDataURL(b);});";
                    webView.evaluateJavascript(js, null);
                } else if (url.startsWith("data:")) {
                    new AndroidNativeBridge().saveBase64File(url, "file_" + System.currentTimeMillis() + ".png", mimeType);
                } else if (url.startsWith("http://") || url.startsWith("https://")) {
                    try {
                        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                        String guessedName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                        req.setMimeType(mimeType);
                        if (userAgent != null) req.addRequestHeader("User-Agent", userAgent);
                        req.setTitle(guessedName);
                        req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                        req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, guessedName);
                        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                        if (dm != null) {
                            dm.enqueue(req);
                            runOnUiThread(() -> Toast.makeText(MainActivity.this, "بدأ تنزيل الملف...", Toast.LENGTH_SHORT).show());
                        }
                    } catch (Exception ignored) {
                        // Fallback silently if DownloadManager rejects non-standard link
                    }
                }
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE && pendingWebPermissionRequest != null) {
            boolean allGranted = grantResults.length > 0;
            for (int res : grantResults) {
                if (res != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            if (allGranted) {
                pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
            } else {
                pendingWebPermissionRequest.deny();
            }
            pendingWebPermissionRequest = null;
        } else if (requestCode == GEO_PERMISSION_REQUEST_CODE && pendingGeoCallback != null) {
            boolean granted = false;
            for (int res : grantResults) {
                if (res == PackageManager.PERMISSION_GRANTED) {
                    granted = true;
                    break;
                }
            }
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoOrigin = null;
            pendingGeoCallback = null;
        }
    }

    public class AndroidNativeBridge {
        @JavascriptInterface
        public void saveBase64File(String dataUrl, String fileName, String mimeType) {
            try {
                String cleanBase64 = dataUrl.contains(",") ? dataUrl.split(",", 2)[1] : dataUrl;
                byte[] bytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                String safeMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "image/png";
                boolean isImage = safeMime.startsWith("image/");

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, safeMime);
                    values.put(
                            MediaStore.MediaColumns.RELATIVE_PATH,
                            isImage ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS
                    );
                    Uri collection = isImage
                            ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                            : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                    Uri itemUri = getContentResolver().insert(collection, values);
                    if (itemUri != null) {
                        try (OutputStream out = getContentResolver().openOutputStream(itemUri)) {
                            if (out != null) out.write(bytes);
                        }
                    }
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(
                            isImage ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS
                    );
                    if (!dir.exists()) dir.mkdirs();
                    File target = new File(dir, fileName);
                    try (FileOutputStream fos = new FileOutputStream(target)) {
                        fos.write(bytes);
                    }
                }
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "تم الحفظ في الاستوديو بنجاح", Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "تعذر حفظ الملف", Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public void shareContent(String title, String text, String dataUrl, String mimeType) {
            try {
                Intent intent = new Intent(Intent.ACTION_SEND);
                if (dataUrl != null && !dataUrl.isEmpty()) {
                    String cleanBase64 = dataUrl.contains(",") ? dataUrl.split(",", 2)[1] : dataUrl;
                    byte[] bytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                    File cacheFile = new File(getCacheDir(), "share_" + System.currentTimeMillis() + ".png");
                    try (FileOutputStream fos = new FileOutputStream(cacheFile)) {
                        fos.write(bytes);
                    }
                    Uri contentUri = FileProvider.getUriForFile(
                            MainActivity.this,
                            getPackageName() + ".fileprovider",
                            cacheFile
                    );
                    intent.setType(mimeType != null && !mimeType.isEmpty() ? mimeType : "image/png");
                    intent.putExtra(Intent.EXTRA_STREAM, contentUri);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } else {
                    intent.setType("text/plain");
                }
                if (title != null && !title.isEmpty()) intent.putExtra(Intent.EXTRA_SUBJECT, title);
                if (text != null && !text.isEmpty()) intent.putExtra(Intent.EXTRA_TEXT, text);
                runOnUiThread(() -> startActivity(Intent.createChooser(intent, title != null ? title : "مشاركة")));
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "تعذر فتح نافذة المشاركة", Toast.LENGTH_SHORT).show());
            }
        }
    }
}
`;
}

export function generateCapacitorConfigJson(config: AppConfig): string {
  return JSON.stringify(
    {
      appId: config.packageName,
      appName: config.appName,
      webDir: 'www',
      bundledWebRuntime: false,
      server: {
        androidScheme: 'https',
      },
      android: {
        allowMixedContent: true,
        captureInput: true,
        webContentsDebuggingEnabled: false,
      },
    },
    null,
    2
  );
}

export function generateCapacitorPackageJson(config: AppConfig): string {
  const safeName = config.packageName.replace(/\./g, '-');
  return JSON.stringify(
    {
      name: safeName,
      version: config.versionName,
      private: true,
      description: `Android Capacitor wrapper for ${config.appName}`,
      scripts: {
        'cap:sync': 'npx cap sync android',
      },
      dependencies: {
        '@capacitor/android': '^6.1.2',
        '@capacitor/camera': '^6.0.0',
        '@capacitor/core': '^6.1.2',
        '@capacitor/filesystem': '^6.0.0',
        '@capacitor/geolocation': '^6.0.0',
        '@capacitor/share': '^6.0.0',
      },
      devDependencies: {
        '@capacitor/cli': '^6.1.2',
      },
    },
    null,
    2
  );
}

function buildSafeApkAssetName(config: AppConfig): string {
  const asciiName = config.appName
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (asciiName.length >= 2) {
    return `${asciiName}.apk`;
  }
  const pkgSlug = config.packageName.split('.').pop() || 'app';
  return `${pkgSlug}.apk`;
}

export function generateGitHubWorkflowYaml(config: AppConfig): string {
  const versionCode = computeVersionCode(config.versionName);
  const pkgPath = config.packageName.replace(/\./g, '/');
  const safeApkName = buildSafeApkAssetName(config);
  const requiredPermissions: Array<{ name: string; tag?: 'uses-permission' | 'uses-feature'; attrs?: string }> = [
    { name: 'android.permission.INTERNET' },
    { name: 'android.permission.ACCESS_NETWORK_STATE' },
    { name: 'android.permission.CAMERA' },
    { name: 'android.permission.RECORD_AUDIO' },
    { name: 'android.permission.MODIFY_AUDIO_SETTINGS' },
    { name: 'android.permission.ACCESS_FINE_LOCATION' },
    { name: 'android.permission.ACCESS_COARSE_LOCATION' },
    { name: 'android.permission.READ_EXTERNAL_STORAGE', attrs: 'android:maxSdkVersion="32"' },
    { name: 'android.permission.WRITE_EXTERNAL_STORAGE', attrs: 'android:maxSdkVersion="32"' },
    { name: 'android.permission.READ_MEDIA_IMAGES' },
    { name: 'android.permission.READ_MEDIA_VIDEO' },
    { name: 'android.permission.READ_MEDIA_AUDIO' },
    { name: 'android.permission.VIBRATE' },
    { name: 'android.permission.WAKE_LOCK' },
    { tag: 'uses-feature', name: 'android.hardware.camera', attrs: 'android:required="false"' },
    { tag: 'uses-feature', name: 'android.hardware.camera.autofocus', attrs: 'android:required="false"' },
    { tag: 'uses-feature', name: 'android.hardware.microphone', attrs: 'android:required="false"' },
    { tag: 'uses-feature', name: 'android.hardware.location.gps', attrs: 'android:required="false"' },
  ];

  const permissionsJson = JSON.stringify(requiredPermissions);
  const orientationVal = config.permissions.orientation;

  return `name: Build Android APK

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

permissions:
  contents: write

env:
  APP_NAME: ${JSON.stringify(config.appName)}
  PACKAGE_ID: ${JSON.stringify(config.packageName)}
  VERSION_NAME: ${JSON.stringify(config.versionName)}
  VERSION_CODE: "${versionCode}"
  PKG_PATH: "${pkgPath}"
  SCREEN_ORIENTATION: "${orientationVal}"
  SAFE_APK_NAME: ${JSON.stringify(safeApkName)}

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Java JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Smart Build Web Project (React / Vite / TS or Static HTML)
        run: |
          mkdir -p www
          if [ -f "source-app/package.json" ]; then
            echo "Detected buildable source project in source-app/"
            cd source-app
            node - <<'NODE_VITE'
          const fs = require('fs');
          const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
          const configFiles = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'];
          let foundViteConfig = false;
          for (const cfgFile of configFiles) {
            if (fs.existsSync(cfgFile)) {
              foundViteConfig = true;
              let cfg = fs.readFileSync(cfgFile, 'utf8');
              if (/\\bbase\\s*:/.test(cfg)) {
                cfg = cfg.replace(/\\bbase\\s*:\\s*(['"\`])[^'"\`]*\\1/, "base: './'");
              } else if (/defineConfig\\s*\\(\\s*\\{/.test(cfg)) {
                cfg = cfg.replace(/defineConfig\\s*\\(\\s*\\{/, "defineConfig({\\n  base: './',");
              } else if (/defineConfig\\s*\\([\\s\\S]*?return\\s*\\{/.test(cfg)) {
                cfg = cfg.replace(/return\\s*\\{/, "return {\\n    base: './',");
              } else if (/export\\s+default\\s+\\{/.test(cfg)) {
                cfg = cfg.replace(/export\\s+default\\s+\\{/, "export default {\\n  base: './',");
              }
              fs.writeFileSync(cfgFile, cfg, 'utf8');
              console.log('Ensured base: "./" in', cfgFile);
            }
          }
          const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
          if (!foundViteConfig && deps.vite) {
            fs.writeFileSync('vite.config.mjs', "export default {\\n  base: './'\\n};\\n", 'utf8');
          }
          NODE_VITE
            npm install --legacy-peer-deps
            if node -e "const p=require('./package.json'); process.exit((p.scripts&&p.scripts.build&&/\\bvite\\b/.test(p.scripts.build)&&!/&&|;/.test(p.scripts.build))?0:1)"; then
              npm run build -- --base=./
            else
              npm run build
            fi
            BUILD_OUT=""
            for dir in dist build out; do
              if [ -f "$dir/index.html" ]; then
                BUILD_OUT="$dir"
                break
              fi
            done
            if [ -z "$BUILD_OUT" ]; then
              echo "ERROR: Build completed but no dist/build/out index.html found"
              exit 1
            fi
            rm -rf ../www/*
            cp -r "$BUILD_OUT"/. ../www/
            cd ..
          elif [ -f "package.json" ] && node -e "const p=require('./package.json'); process.exit(p.scripts&&p.scripts.build?0:1)"; then
            echo "Detected buildable project in repository root"
            node - <<'NODE_VITE_ROOT'
          const fs = require('fs');
          for (const cfgFile of ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs']) {
            if (fs.existsSync(cfgFile)) {
              let cfg = fs.readFileSync(cfgFile, 'utf8');
              if (/\\bbase\\s*:/.test(cfg)) {
                cfg = cfg.replace(/\\bbase\\s*:\\s*(['"\`])[^'"\`]*\\1/, "base: './'");
              } else if (/defineConfig\\s*\\(\\s*\\{/.test(cfg)) {
                cfg = cfg.replace(/defineConfig\\s*\\(\\s*\\{/, "defineConfig({\\n  base: './',");
              } else if (/defineConfig\\s*\\([\\s\\S]*?return\\s*\\{/.test(cfg)) {
                cfg = cfg.replace(/return\\s*\\{/, "return {\\n    base: './',");
              } else if (/export\\s+default\\s+\\{/.test(cfg)) {
                cfg = cfg.replace(/export\\s+default\\s+\\{/, "export default {\\n  base: './',");
              }
              fs.writeFileSync(cfgFile, cfg, 'utf8');
            }
          }
          NODE_VITE_ROOT
            npm install --legacy-peer-deps
            if node -e "const p=require('./package.json'); process.exit((p.scripts&&p.scripts.build&&/\\bvite\\b/.test(p.scripts.build)&&!/&&|;/.test(p.scripts.build))?0:1)"; then
              npm run build -- --base=./
            else
              npm run build
            fi
            for dir in dist build out; do
              if [ -f "$dir/index.html" ]; then
                rm -rf www/*
                cp -r "$dir"/. www/
                break
              fi
            done
          else
            echo "Detected static HTML/CSS/JS project"
            if [ ! -f "www/index.html" ] && [ -f "index.html" ]; then
              cp -r *.html *.js *.css *.json assets icons images fonts www/ 2>/dev/null || true
            fi
          fi

          if [ -f "www/index.html" ]; then
            node - <<'NODE_HTML_FIX'
          const fs = require('fs');
          let html = fs.readFileSync('www/index.html', 'utf8');
          html = html.replace(/(\\b(?:src|href|poster|data-src)=["'])\\/(?!\\/)/gi, '$1./');
          html = html.replace(/<base\\s+href=["']\\/["']\\s*\\/?>/gi, '<base href="./" />');
          if (fs.existsSync('android-overrides/www/android-native-bridge.js')) {
            fs.copyFileSync('android-overrides/www/android-native-bridge.js', 'www/android-native-bridge.js');
            if (!html.includes('android-native-bridge.js')) {
              const tag = '<script src="./android-native-bridge.js"></' + 'script>';
              html = /<\\/head>/i.test(html)
                ? html.replace(/<\\/head>/i, '  ' + tag + '\\n  </head>')
                : (tag + '\\n' + html);
            }
          }
          fs.writeFileSync('www/index.html', html, 'utf8');
          NODE_HTML_FIX
          fi

      - name: Initialize Clean Capacitor Project & Add Android
        run: |
          rm -rf android package.json package-lock.json capacitor.config.json capacitor.config.ts
          mkdir -p www
          npm init -y
          npm install @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6 @capacitor/filesystem@6 @capacitor/share@6 @capacitor/camera@6 @capacitor/geolocation@6
          node -e "const fs=require('fs'); fs.writeFileSync('capacitor.config.json', JSON.stringify({ appId: process.env.PACKAGE_ID, appName: process.env.APP_NAME, webDir: 'www', bundledWebRuntime: false, server: { androidScheme: 'https' }, android: { allowMixedContent: true, captureInput: true, webContentsDebuggingEnabled: false } }, null, 2));"
          npx cap add android
          npx cap sync android

      - name: Inject Android Permissions, Native Bridges & App Version
        run: |
          node - <<'NODE'
          const fs = require('fs');
          const path = require('path');

          const manifestPath = path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
          let manifest = fs.readFileSync(manifestPath, 'utf8');

          if (!manifest.includes('xmlns:tools=')) {
            manifest = manifest.replace(
              /<manifest\\b/,
              '<manifest xmlns:tools="http://schemas.android.com/tools"'
            );
          }

          const entries = ${permissionsJson};
          const permissionTags = [];
          for (const entry of entries) {
            const tagName = entry.tag || 'uses-permission';
            if (!manifest.includes(entry.name)) {
              const attr = entry.attrs ? ' ' + entry.attrs : '';
              permissionTags.push('    <' + tagName + ' android:name="' + entry.name + '"' + attr + ' />');
            }
          }
          if (permissionTags.length > 0) {
            manifest = manifest.replace(
              /<application(?=\\s|>)/,
              permissionTags.join('\\n') + '\\n\\n    <application'
            );
          }

          const appAttrs = [];
          if (!manifest.includes('android:usesCleartextTraffic')) {
            appAttrs.push('android:usesCleartextTraffic="true"');
          }
          if (!manifest.includes('android:supportsRtl')) {
            appAttrs.push('android:supportsRtl="true"');
          }
          if (!manifest.includes('android:requestLegacyExternalStorage')) {
            appAttrs.push('android:requestLegacyExternalStorage="true"');
          }
          if (appAttrs.length > 0) {
            manifest = manifest.replace(
              /<application\\b/,
              '<application\\n        ' + appAttrs.join('\\n        ')
            );
          }

          const orientation = process.env.SCREEN_ORIENTATION;
          if (orientation && orientation !== 'unspecified' && !manifest.includes('android:screenOrientation')) {
            manifest = manifest.replace(
              /<activity\\b/,
              '<activity\\n            android:screenOrientation="' + orientation + '"'
            );
          }

          fs.writeFileSync(manifestPath, manifest, 'utf8');

          const gradlePath = path.join('android', 'app', 'build.gradle');
          if (fs.existsSync(gradlePath)) {
            let gradle = fs.readFileSync(gradlePath, 'utf8');
            gradle = gradle.replace(/versionCode\\s+\\d+/, 'versionCode ' + process.env.VERSION_CODE);
            gradle = gradle.replace(/versionName\\s+"[^"]*"/, 'versionName "' + process.env.VERSION_NAME + '"');
            fs.writeFileSync(gradlePath, gradle, 'utf8');
          }
          NODE

          mkdir -p android/app/src/main/res/xml
          cp android-overrides/res/xml/file_paths.xml android/app/src/main/res/xml/file_paths.xml
          mkdir -p "android/app/src/main/java/$PKG_PATH"
          cp android-overrides/java/MainActivity.java "android/app/src/main/java/$PKG_PATH/MainActivity.java"

      - name: Replace Default Capacitor Icon with Custom App Icon
        if: hashFiles('app_icon.png') != ''
        run: |
          rm -rf android/app/src/main/res/mipmap-anydpi-v26
          python3 -m pip install --quiet pillow || true
          python3 - <<'PY'
          import os, shutil
          sizes = {
              'mipmap-mdpi': 48,
              'mipmap-hdpi': 72,
              'mipmap-xhdpi': 96,
              'mipmap-xxhdpi': 144,
              'mipmap-xxxhdpi': 192,
          }
          try:
              from PIL import Image
              img = Image.open('app_icon.png').convert('RGBA')
              for folder, sz in sizes.items():
                  out_dir = os.path.join('android/app/src/main/res', folder)
                  os.makedirs(out_dir, exist_ok=True)
                  resized = img.resize((sz, sz), Image.Resampling.LANCZOS)
                  resized.save(os.path.join(out_dir, 'ic_launcher.png'))
                  resized.save(os.path.join(out_dir, 'ic_launcher_round.png'))
          except Exception as e:
              print("PIL resize fallback to direct copy:", e)
              for folder in sizes:
                  out_dir = os.path.join('android/app/src/main/res', folder)
                  os.makedirs(out_dir, exist_ok=True)
                  shutil.copyfile('app_icon.png', os.path.join(out_dir, 'ic_launcher.png'))
                  shutil.copyfile('app_icon.png', os.path.join(out_dir, 'ic_launcher_round.png'))
          PY

      - name: Sync Capacitor Web Assets
        run: npx cap sync android

      - name: Build Debug APK with Gradle
        run: |
          yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses || true
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug --stacktrace --no-daemon

      - name: Prepare Release APK
        run: |
          mkdir -p release
          cp android/app/build/outputs/apk/debug/app-debug.apk "release/$SAFE_APK_NAME"

      - name: Publish Direct APK GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: "v\${{ env.VERSION_NAME }}-build-\${{ github.run_number }}"
          name: "APK Build v\${{ env.VERSION_NAME }} (#\${{ github.run_number }})"
          files: "release/\${{ env.SAFE_APK_NAME }}"
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Upload Debug APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: app-debug-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
          if-no-files-found: error
`;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;
  const binaryString =
    typeof atob === 'function'
      ? atob(parts[1])
      : Buffer.from(parts[1], 'base64').toString('binary');
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function buildCapacitorProjectFiles(
  config: AppConfig,
  analysis: ZipAnalysisResult
): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array> = {};
  const bridgeEnabled = config.permissions.gallerySave || config.permissions.nativeShare;
  const bridgeJs = bridgeEnabled ? buildAndroidNativeBridgeJs(config) : null;

  if (bridgeJs) {
    files['android-overrides/www/android-native-bridge.js'] = bridgeJs;
  }

  // 1. Store either buildable React/Vite/TS source under source-app/ OR static HTML directly under www/
  if (analysis.hasBuildScript) {
    for (const [relPath, content] of Object.entries(analysis.normalizedFiles)) {
      files[`source-app/${relPath}`] = content;
    }
  } else {
    for (const [relPath, content] of Object.entries(analysis.normalizedFiles)) {
      if (relPath === 'index.html' && typeof content === 'string') {
        files[`www/${relPath}`] = injectBridgeIntoIndexHtml(content, bridgeEnabled);
      } else {
        files[`www/${relPath}`] = content;
      }
    }
    if (bridgeJs) {
      files['www/android-native-bridge.js'] = bridgeJs;
    }
  }

  // 2. Capacitor config & package.json (helpful for local ZIP inspection; workflow refreshes cleanly)
  files['package.json'] = generateCapacitorPackageJson(config);
  files['capacitor.config.json'] = generateCapacitorConfigJson(config);

  // 3. Android native overrides
  files['android-overrides/AndroidManifest.xml'] = generateAndroidManifestXml(config);
  files['android-overrides/res/xml/file_paths.xml'] = generateFilePathsXml();
  files['android-overrides/java/MainActivity.java'] = generateMainActivityJava(config);

  // 4. App icon PNG if provided (saved cleanly at root as app_icon.png)
  if (config.iconDataUrl) {
    const iconBytes = dataUrlToUint8Array(config.iconDataUrl);
    if (iconBytes) {
      files['app_icon.png'] = iconBytes;
    }
  }

  // 5. GitHub Actions Workflow
  files['.github/workflows/build.yml'] = generateGitHubWorkflowYaml(config);

  return files;
}
