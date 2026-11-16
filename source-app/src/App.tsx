import React, { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { CheckCircle2, FileArchive, History } from 'lucide-react';
import { Sidebar, type ActiveTab } from './components/Sidebar';
import { ZipDropzone } from './components/ZipDropzone';
import { AppIdentityForm } from './components/AppIdentityForm';
import { NativePermissionsPanel } from './components/NativePermissionsPanel';
import { CloudBuildPanel } from './components/CloudBuildPanel';
import { BuildHistoryView } from './components/BuildHistoryView';
import { CloudSettingsView } from './components/CloudSettingsView';
import { ApkDecompilerView } from './components/ApkDecompilerView';
import type {
  ApkInspectionResult,
  AppConfig,
  BuildRecord,
  CloudBuildStep,
  DecompileStep,
  GitHubUserInfo,
  ZipAnalysisResult,
} from './types/apk';
import {
  computeVersionCode,
  generatePackageName,
  validatePackageName,
  validateVersionName,
} from './utils/packageUtils';
import { analyzeAndNormalizeZip, createSampleProjectZip } from './utils/zipAnalyzer';
import { buildCapacitorProjectFiles } from './utils/capacitorGenerator';
import { buildJadxRepoFiles, inspectAndExtractApk } from './utils/apkDecompiler';
import {
  downloadGitHubApkApi,
  downloadGitHubSourceZipApi,
  fetchBuildsList,
  fetchGitHubBuildStatusApi,
  patchBuildRecord,
  removeBuildRecord,
  startGitHubBuildApi,
  upsertBuildRecord,
  verifyGitHubTokenApi,
} from './utils/apiClient';

const TOKEN_STORAGE_KEY = 'github_token';
const LEGACY_TOKEN_STORAGE_KEY = 'apk_pro_github_pat';
const PRIVATE_REPO_KEY = 'apk_pro_private_repo';

function readStoredGithubToken(): string {
  try {
    return (
      localStorage.getItem(TOKEN_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) ||
      ''
    );
  } catch {
    return '';
  }
}

function storeGithubToken(token: string): void {
  try {
    const trimmed = token.trim();
    if (trimmed) {
      localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
      localStorage.setItem(LEGACY_TOKEN_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage quota
  }
}

const DEFAULT_CONFIG: AppConfig = {
  appName: 'تطبيقي الجديد',
  packageName: 'com.apkpro.tatbiqi_aljadid',
  versionName: '1.0.0',
  iconDataUrl: null,
  permissions: {
    gallerySave: true,
    nativeShare: true,
    microphone: true,
    fullscreen: false,
    orientation: 'unspecified',
  },
};

function createInitialSteps(): CloudBuildStep[] {
  return [
    {
      id: 'prepare_zip',
      label: 'تهيئة ملفات المشروع وتوليد Capacitor',
      detail: 'تضمين جسور الكاميرا والميكروفون والموقع و MediaStore و FileProvider',
      status: 'pending',
    },
    {
      id: 'create_repo',
      label: 'إنشاء مستودع البناء المؤقت على GitHub',
      detail: 'تجهيز بيئة البناء السحابية وربط GitHub Actions',
      status: 'pending',
    },
    {
      id: 'push_capacitor',
      label: 'رفع حزمة المشروع وسير عمل البناء الذكي',
      detail: 'نقل الملفات المصدرية أو www/ و AndroidManifest.xml و .github/workflows/build.yml',
      status: 'pending',
    },
    {
      id: 'github_actions',
      label: 'البناء الذكي وبناء APK عبر Gradle',
      detail: 'بناء React/Vite تلقائياً إن وُجد، وتثبيت إضافات Capacitor 6 وبناء app-debug.apk',
      status: 'pending',
    },
    {
      id: 'apk_ready',
      label: 'تجهيز ملف APK النهائي للتحميل',
      detail: 'استخراج app-debug.apk والتحقق من جاهزيته للتثبيت',
      status: 'pending',
    },
  ];
}

function createInitialDecompileSteps(): DecompileStep[] {
  return [
    {
      id: 'inspect_apk',
      label: 'تجهيز ملف APK وسير عمل JADX',
      detail: 'إعداد input/app.apk وملف .github/workflows/decompile.yml',
      status: 'pending',
    },
    {
      id: 'create_repo',
      label: 'إنشاء مستودع التفكيك المؤقت على GitHub',
      detail: 'تجهيز بيئة التفكيك السحابية وربط GitHub Actions',
      status: 'pending',
    },
    {
      id: 'push_apk',
      label: 'رفع ملف APK إلى بيئة JADX السحابية',
      detail: 'نقل الحزمة الثنائية وتشغيل مسار التحليل',
      status: 'pending',
    },
    {
      id: 'jadx_actions',
      label: 'تفكيك الكود المصدري والموارد عبر JADX',
      detail: 'استخراج ملفات Java/Kotlin (src) والموارد (res) وضغطها في ZIP',
      status: 'pending',
    },
    {
      id: 'zip_ready',
      label: 'تجهيز ملف الكود المصدري (.zip)',
      detail: 'ملف extracted_source.zip جاهز للحفظ أو الفتح في AI Studio',
      status: 'pending',
    },
  ];
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function utf8ToBase64(text: string): string {
  return uint8ToBase64(new TextEncoder().encode(text));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '');
      const commaIdx = dataUrl.indexOf(',');
      resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
    };
    reader.onerror = () => reject(new Error('تعذر تحويل ملف APK إلى Base64'));
    reader.readAsDataURL(blob);
  });
}

function sanitizeApkBaseName(name: string, fallbackPkg: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallbackPkg || 'app';
}

interface GlobalCapacitorFilesystem {
  requestPermissions?: () => Promise<unknown>;
  writeFile: (opts: {
    path: string;
    data: string;
    directory: string;
    recursive?: boolean;
  }) => Promise<{ uri: string }>;
  getUri?: (opts: { path: string; directory: string }) => Promise<{ uri: string }>;
  downloadFile?: (opts: {
    url: string;
    path: string;
    directory: string;
    recursive?: boolean;
    headers?: Record<string, string>;
  }) => Promise<{ path?: string }>;
}

interface GlobalCapacitorShare {
  share: (opts: {
    title?: string;
    text?: string;
    url?: string;
    dialogTitle?: string;
  }) => Promise<unknown>;
}

function getGlobalCapacitor(): {
  isNativePlatform?: () => boolean;
  Plugins?: {
    Filesystem?: GlobalCapacitorFilesystem;
    Share?: GlobalCapacitorShare;
  };
} | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: ReturnType<typeof getGlobalCapacitor> }).Capacitor || null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('converter');
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [editingBuildId, setEditingBuildId] = useState<string | null>(null);
  const [packageManuallyEdited, setPackageManuallyEdited] = useState(false);

  // ZIP state
  const [analysis, setAnalysis] = useState<ZipAnalysisResult | null>(null);
  const [zipProcessing, setZipProcessing] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  // Build history state
  const [builds, setBuilds] = useState<BuildRecord[]>([]);
  const [buildsLoading, setBuildsLoading] = useState(true);

  // GitHub auth state
  const [githubToken, setGithubToken] = useState<string>(() => readStoredGithubToken());
  const [isPrivateRepo, setIsPrivateRepo] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(PRIVATE_REPO_KEY);
      return saved === null ? false : saved === 'true';
    } catch {
      return false;
    }
  });
  const [githubUser, setGithubUser] = useState<GitHubUserInfo | null>(null);
  const [tokenScopes, setTokenScopes] = useState<string[]>([]);

  // Cloud build state
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildProgressPct, setBuildProgressPct] = useState(0);
  const [buildSteps, setBuildSteps] = useState<CloudBuildStep[]>(createInitialSteps);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [failedRunUrl, setFailedRunUrl] = useState<string | null>(null);
  const [errorLogsTail, setErrorLogsTail] = useState<string[]>([]);
  const [readyApkInfo, setReadyApkInfo] = useState<{
    owner: string;
    repo: string;
    repoUrl: string;
    runUrl?: string;
    artifactId?: number;
    releaseAssetId?: number;
    releaseAssetUrl?: string;
    releaseDownloadUrl?: string;
    fileName: string;
    appName: string;
  } | null>(null);
  const [savedApkNotice, setSavedApkNotice] = useState<{
    message: string;
    savedPath?: string;
    shareUri?: string;
    fileName: string;
  } | null>(null);
  const [isDownloadingApk, setIsDownloadingApk] = useState(false);

  // APK Decompiler state
  const [apkInspection, setApkInspection] = useState<ApkInspectionResult | null>(null);
  const [isInspectingApk, setIsInspectingApk] = useState(false);
  const [apkInspectError, setApkInspectError] = useState<string | null>(null);
  const [isDecompiling, setIsDecompiling] = useState(false);
  const [decompileProgressPct, setDecompileProgressPct] = useState(0);
  const [decompileSteps, setDecompileSteps] = useState<DecompileStep[]>(createInitialDecompileSteps);
  const [decompileError, setDecompileError] = useState<string | null>(null);
  const [decompileFailedRunUrl, setDecompileFailedRunUrl] = useState<string | null>(null);
  const [decompileErrorLogsTail, setDecompileErrorLogsTail] = useState<string[]>([]);
  const [readyCloudZipInfo, setReadyCloudZipInfo] = useState<{
    owner: string;
    repo: string;
    repoUrl: string;
    runUrl?: string;
    artifactId?: number;
    releaseAssetId?: number;
    releaseAssetUrl?: string;
    releaseDownloadUrl?: string;
    fileName: string;
    cachedBlob?: Blob;
  } | null>(null);
  const [savedZipNotice, setSavedZipNotice] = useState<{
    message: string;
    savedPath?: string;
    shareUri?: string;
    fileName: string;
  } | null>(null);
  const [isSavingZip, setIsSavingZip] = useState(false);

  // Transient inline notice banner
  const [notice, setNotice] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const decompilePollTimerRef = useRef<number | null>(null);

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  const fetchBuilds = useCallback(async () => {
    setBuildsLoading(true);
    try {
      const list = await fetchBuildsList();
      setBuilds(list);
    } finally {
      setBuildsLoading(false);
    }
  }, []);

  const saveTokenOnly = useCallback((token: string) => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setGithubToken(trimmed);
    storeGithubToken(trimmed);
  }, []);

  const verifyToken = useCallback(async (token: string) => {
    const trimmed = token.trim();
    if (!trimmed) {
      return { ok: false, error: 'يرجى إدخال رمز GitHub الشخصي أولاً.' };
    }
    setGithubToken(trimmed);
    storeGithubToken(trimmed);

    const result = await verifyGitHubTokenApi(trimmed);
    if (!result.ok || !result.user) {
      return { ok: false, error: result.error || 'رمز GitHub غير صالح' };
    }
    setGithubUser(result.user);
    setTokenScopes(result.scopes || []);
    return { ok: true };
  }, []);

  useEffect(() => {
    fetchBuilds();
    const savedToken = readStoredGithubToken();
    if (savedToken) {
      setGithubToken(savedToken);
      verifyToken(savedToken);
    }
    return () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
      }
      if (decompilePollTimerRef.current) {
        window.clearTimeout(decompilePollTimerRef.current);
      }
    };
  }, [fetchBuilds, verifyToken]);

  const handleTogglePrivateRepo = (val: boolean) => {
    setIsPrivateRepo(val);
    try {
      localStorage.setItem(PRIVATE_REPO_KEY, String(val));
    } catch {
      // ignore
    }
  };

  const handleClearToken = () => {
    setGithubToken('');
    setGithubUser(null);
    setTokenScopes([]);
    storeGithubToken('');
  };

  const handleZipBuffer = async (buffer: ArrayBuffer | Uint8Array, fileName: string) => {
    setZipProcessing(true);
    setZipError(null);
    setReadyApkInfo(null);
    setSavedApkNotice(null);
    setBuildError(null);
    try {
      const result = await analyzeAndNormalizeZip(buffer, fileName);
      setAnalysis(result);
      if (result.detectedTitle && !editingBuildId) {
        setConfig((prev) => ({
          ...prev,
          appName: result.detectedTitle || prev.appName,
          packageName: packageManuallyEdited
            ? prev.packageName
            : generatePackageName(result.detectedTitle || prev.appName),
        }));
      }
    } catch (err) {
      setZipError(err instanceof Error ? err.message : 'تعذر قراءة الملف المضغوط');
      setAnalysis(null);
    } finally {
      setZipProcessing(false);
    }
  };

  const handleFileSelected = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setZipError('يرجى اختيار ملف مضغوط بصيغة .zip فقط.');
      return;
    }
    const buf = await file.arrayBuffer();
    await handleZipBuffer(buf, file.name);
  };

  const handleLoadSample = async () => {
    const sample = await createSampleProjectZip();
    await handleZipBuffer(sample.buffer, sample.fileName);
  };

  const handleAppNameChange = (appName: string) => {
    setConfig((prev) => ({
      ...prev,
      appName,
      packageName: packageManuallyEdited
        ? prev.packageName
        : generatePackageName(appName || 'app'),
    }));
  };

  const handlePackageNameChange = (packageName: string) => {
    setPackageManuallyEdited(true);
    setConfig((prev) => ({ ...prev, packageName }));
  };

  const handleRegeneratePackageName = () => {
    setPackageManuallyEdited(false);
    setConfig((prev) => ({
      ...prev,
      packageName: generatePackageName(prev.appName || 'app'),
    }));
  };

  const hasValidConfig =
    config.appName.trim().length > 0 &&
    validatePackageName(config.packageName).valid &&
    validateVersionName(config.versionName).valid;

  const saveRecordToServer = async (record: BuildRecord) => {
    await upsertBuildRecord(record);
    await fetchBuilds();
  };

  const handleExportCapacitorZip = async () => {
    if (!analysis || !hasValidConfig) return;
    const files = buildCapacitorProjectFiles(config, analysis);
    const outZip = new JSZip();
    for (const [path, content] of Object.entries(files)) {
      outZip.file(path, content);
    }
    const blob = await outZip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.packageName}-capacitor-android.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    const now = new Date().toISOString();
    const recordId = editingBuildId || `build-${Date.now()}`;
    setEditingBuildId(recordId);
    await saveRecordToServer({
      id: recordId,
      appName: config.appName.trim(),
      packageName: config.packageName.trim(),
      versionName: config.versionName.trim(),
      versionCode: computeVersionCode(config.versionName),
      iconDataUrl: config.iconDataUrl,
      permissions: config.permissions,
      sourceZipName: analysis.fileName,
      fileCount: analysis.fileCount,
      wasReorganized: analysis.wasReorganized,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });

    showNotice('تم تصدير حزمة Capacitor الجاهزة وحفظ التطبيق في السجل بنجاح.');
  };

  const updateStep = (
    stepId: CloudBuildStep['id'],
    status: CloudBuildStep['status'],
    detail?: string
  ) => {
    setBuildSteps((prev) =>
      prev.map((s) =>
        s.id === stepId ? { ...s, status, detail: detail ?? s.detail } : s
      )
    );
  };

  const handleStartCloudBuild = async () => {
    if (!analysis || !hasValidConfig) return;
    if (!githubToken.trim()) {
      setBuildError('يرجى إدخال رمز GitHub الشخصي أولاً لتشغيل البناء السحابي.');
      return;
    }

    setBuildError(null);
    setFailedRunUrl(null);
    setErrorLogsTail([]);
    setReadyApkInfo(null);
    setSavedApkNotice(null);
    setIsBuilding(true);
    setBuildSteps(createInitialSteps());
    setBuildProgressPct(10);

    const recordId = editingBuildId || `build-${Date.now()}`;
    setEditingBuildId(recordId);

    try {
      // Step 1: Prepare files
      updateStep('prepare_zip', 'active');
      const projectFiles = buildCapacitorProjectFiles(config, analysis);
      const encodedFiles = Object.entries(projectFiles).map(([path, content]) => ({
        path,
        contentBase64:
          typeof content === 'string' ? utf8ToBase64(content) : uint8ToBase64(content),
      }));
      updateStep('prepare_zip', 'done', `تم تجهيز ${encodedFiles.length} ملفاً مع الجسور الأصلية`);
      setBuildProgressPct(25);

      // Step 2 & 3: Create Repo & Push Files
      updateStep('create_repo', 'active');
      const shortSlug = config.packageName.split('.').pop() || 'app';
      const repoName = `apk-build-${shortSlug}-${Date.now().toString(36)}`;

      const startData = await startGitHubBuildApi({
        token: githubToken.trim(),
        repoName,
        isPrivate: isPrivateRepo,
        files: encodedFiles,
      });
      if (!startData.ok || !startData.owner || !startData.repo) {
        updateStep('create_repo', 'error', startData.error || 'فشل إنشاء المستودع');
        setBuildError(startData.error || 'تعذر بدء عملية البناء السحابي.');
        setIsBuilding(false);
        return;
      }

      updateStep('create_repo', 'done', `تم إنشاء المستودع ${startData.repoFullName}`);
      updateStep('push_capacitor', 'done', 'تم رفع جميع الملفات وتشغيل سير عمل البناء');
      updateStep('github_actions', 'active', 'بانتظار بدء GitHub Actions Runner...');
      setBuildProgressPct(50);

      const now = new Date().toISOString();
      await saveRecordToServer({
        id: recordId,
        appName: config.appName.trim(),
        packageName: config.packageName.trim(),
        versionName: config.versionName.trim(),
        versionCode: computeVersionCode(config.versionName),
        iconDataUrl: config.iconDataUrl,
        permissions: config.permissions,
        sourceZipName: analysis.fileName,
        fileCount: analysis.fileCount,
        wasReorganized: analysis.wasReorganized,
        status: 'in_progress',
        repoFullName: startData.repoFullName,
        repoUrl: startData.repoUrl,
        createdAt: now,
        updatedAt: now,
      });

      const buildOwner = startData.owner;
      const buildRepo = startData.repo;
      const buildRepoUrl = startData.repoUrl || '';

      // Step 4: Poll GitHub Actions status
      const pollStatus = async (attempt: number) => {
        if (attempt > 90) {
          updateStep('github_actions', 'error', 'انتهت مهلة الانتظار؛ يمكنك متابعة البناء من GitHub');
          setBuildError('استغرق البناء وقتاً أطول من المعتاد. راجع حالة التشغيل على GitHub.');
          setIsBuilding(false);
          return;
        }

        try {
          const stData = await fetchGitHubBuildStatusApi({
            token: githubToken.trim(),
            owner: buildOwner,
            repo: buildRepo,
            commitSha: startData.commitSha,
          });

          if (stData.found) {
            const activeStep = (stData.steps || []).find(
              (s: { status: string; name: string }) => s.status === 'in_progress'
            );
            const completedCount = (stData.steps || []).filter(
              (s: { status: string }) => s.status === 'completed'
            ).length;
            const totalSteps = Math.max(1, (stData.steps || []).length);

            if (stData.status === 'completed') {
              if (stData.conclusion === 'success' && (stData.releaseAssetId || stData.artifactId)) {
                updateStep('github_actions', 'done', 'اكتمل بناء Gradle (assembleDebug) بنجاح');
                updateStep('apk_ready', 'done', 'ملف app-debug.apk جاهز للتحميل والتثبيت المباشر');
                setBuildProgressPct(100);

                const baseAppName = sanitizeApkBaseName(config.appName, config.packageName);
                const apkFileName = `${baseAppName}.apk`;
                setReadyApkInfo({
                  owner: buildOwner,
                  repo: buildRepo,
                  repoUrl: buildRepoUrl,
                  runUrl: stData.runUrl,
                  artifactId: stData.artifactId,
                  releaseAssetId: stData.releaseAssetId,
                  releaseAssetUrl: stData.releaseAssetUrl,
                  releaseDownloadUrl: stData.releaseDownloadUrl,
                  fileName: apkFileName,
                  appName: config.appName.trim() || baseAppName,
                });

                await patchBuildRecord(recordId, {
                  status: 'completed',
                  workflowRunId: stData.runId,
                  workflowRunUrl: stData.runUrl,
                  artifactId: stData.artifactId,
                  releaseAssetId: stData.releaseAssetId,
                  releaseAssetUrl: stData.releaseAssetUrl,
                  releaseDownloadUrl: stData.releaseDownloadUrl,
                  releaseAssetName: stData.releaseAssetName,
                });
                await fetchBuilds();
                setIsBuilding(false);
                return;
              } else {
                const failedStepLabel = stData.failedStepName
                  ? `فشل البناء في الخطوة: "${stData.failedStepName}" (${stData.failedStepConclusion || stData.conclusion || 'failure'})`
                  : `فشل البناء في GitHub Actions (${stData.conclusion || 'failure'})`;
                const fullErrorMessage = stData.errorDetail
                  ? `${failedStepLabel} — ${stData.errorDetail}`
                  : failedStepLabel;

                updateStep('github_actions', 'error', failedStepLabel);
                setFailedRunUrl(stData.runUrl || null);
                setErrorLogsTail(stData.errorLogsTail || []);
                setBuildError(fullErrorMessage);
                await patchBuildRecord(recordId, {
                  status: 'failed',
                  workflowRunId: stData.runId,
                  workflowRunUrl: stData.runUrl,
                  errorMessage: fullErrorMessage,
                });
                await fetchBuilds();
                setIsBuilding(false);
                return;
              }
            } else {
              const pct = Math.min(92, 52 + Math.round((completedCount / totalSteps) * 40));
              setBuildProgressPct(pct);
              if (activeStep) {
                updateStep('github_actions', 'active', `الخطوة الحالية: ${activeStep.name}`);
              }
            }
          }
        } catch {
          // continue polling on transient network hiccup
        }

        pollTimerRef.current = window.setTimeout(() => pollStatus(attempt + 1), 4500);
      };

      pollTimerRef.current = window.setTimeout(() => pollStatus(1), 3500);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء البناء');
      setIsBuilding(false);
    }
  };

  const downloadApkFromGitHub = async (params: {
    owner: string;
    repo: string;
    artifactId?: number;
    releaseAssetId?: number;
    releaseAssetUrl?: string;
    releaseDownloadUrl?: string;
    fileName: string;
    appName?: string;
  }) => {
    if (!githubToken.trim()) {
      setBuildError('يرجى إدخال رمز GitHub الشخصي أولاً لتحميل ملف APK.');
      return;
    }
    setIsDownloadingApk(true);
    setBuildError(null);
    setSavedApkNotice(null);

    const finalFileName = params.fileName.endsWith('.apk')
      ? params.fileName
      : `${params.fileName}.apk`;

    try {
      const cap = getGlobalCapacitor();
      const isNative = Boolean(cap?.isNativePlatform?.());
      const Filesystem = cap?.Plugins?.Filesystem;
      const Share = cap?.Plugins?.Share;

      if (isNative && Filesystem) {
        try {
          await Filesystem.requestPermissions?.();
        } catch {
          // Scoped storage on Android 10+ allows writing app-created files in DOCUMENTS without legacy prompt
        }

        const documentsPath = `APK_Builder/${finalFileName}`;
        let savedDirectory = 'DOCUMENTS';
        let savedPath = `Documents/${documentsPath}`;
        let savedUri: string | undefined;

        // Strategy A: Native Filesystem.downloadFile bypasses WebView CORS/redirects cleanly
        const nativeUrl =
          (!isPrivateRepo && params.releaseDownloadUrl) ||
          params.releaseAssetUrl ||
          (params.releaseAssetId
            ? `https://api.github.com/repos/${params.owner}/${params.repo}/releases/assets/${params.releaseAssetId}`
            : undefined);

        if (nativeUrl && typeof Filesystem.downloadFile === 'function') {
          try {
            const headers: Record<string, string> | undefined =
              !isPrivateRepo && params.releaseDownloadUrl
                ? undefined
                : {
                    Authorization: `Bearer ${githubToken.trim()}`,
                    Accept: 'application/octet-stream',
                  };
            await Filesystem.downloadFile({
              url: nativeUrl,
              path: documentsPath,
              directory: 'DOCUMENTS',
              recursive: true,
              ...(headers ? { headers } : {}),
            });
            if (typeof Filesystem.getUri === 'function') {
              const uriRes = await Filesystem.getUri({
                path: documentsPath,
                directory: 'DOCUMENTS',
              });
              savedUri = uriRes.uri;
            }
          } catch {
            // Fall through to JS fetch/JSZip + Filesystem.writeFile
            savedUri = undefined;
          }
        }

        // Strategy B: Fetch Release Asset or extract zipped Artifact via JSZip -> writeFile into DOCUMENTS (or CACHE fallback)
        if (!savedUri) {
          const result = await downloadGitHubApkApi({
            token: githubToken.trim(),
            owner: params.owner,
            repo: params.repo,
            artifactId: params.artifactId,
            releaseAssetId: params.releaseAssetId,
            releaseAssetUrl: params.releaseAssetUrl,
            releaseDownloadUrl: params.releaseDownloadUrl,
            fileName: finalFileName,
          });
          if (!result.ok || !result.blob) {
            setBuildError(result.error || 'تعذر تحميل ملف APK من GitHub.');
            return;
          }

          const base64Data = await blobToBase64(result.blob);
          try {
            const writeRes = await Filesystem.writeFile({
              path: documentsPath,
              data: base64Data,
              directory: 'DOCUMENTS',
              recursive: true,
            });
            savedUri = writeRes.uri;
          } catch (docErr) {
            try {
              savedDirectory = 'CACHE';
              savedPath = `Cache/${finalFileName}`;
              const cacheRes = await Filesystem.writeFile({
                path: finalFileName,
                data: base64Data,
                directory: 'CACHE',
                recursive: true,
              });
              savedUri = cacheRes.uri;
            } catch (cacheErr) {
              const dMsg = docErr instanceof Error ? docErr.message : String(docErr);
              const cMsg = cacheErr instanceof Error ? cacheErr.message : String(cacheErr);
              throw new Error(`تعذر حفظ الملف على الهاتف (Documents: ${dMsg} | Cache: ${cMsg})`);
            }
          }
        }

        const successMsg =
          savedDirectory === 'DOCUMENTS'
            ? 'تم حفظ التطبيق بنجاح في مجلد Documents/APK_Builder!'
            : 'تم تجهيز التطبيق بنجاح في ذاكرة التطبيق المؤقتة للمشاركة والتثبيت!';

        setSavedApkNotice({
          message: successMsg,
          savedPath,
          shareUri: savedUri,
          fileName: finalFileName,
        });
        showNotice(successMsg);

        // Immediately trigger native Android Share / Package Installer sheet
        if (Share && typeof Share.share === 'function' && savedUri) {
          try {
            await Share.share({
              title: finalFileName,
              text: `تثبيت تطبيق ${finalFileName}`,
              url: savedUri,
              dialogTitle: 'حفظ في الملفات أو التثبيت عبر أداة تثبيت الحزم',
            });
          } catch {
            // User dismissed the share dialog; keep saved notice visible with retry button
          }
        }
        return;
      }

      // Standard web browser download
      const result = await downloadGitHubApkApi({
        token: githubToken.trim(),
        owner: params.owner,
        repo: params.repo,
        artifactId: params.artifactId,
        releaseAssetId: params.releaseAssetId,
        releaseAssetUrl: params.releaseAssetUrl,
        releaseDownloadUrl: params.releaseDownloadUrl,
        fileName: finalFileName,
      });
      if (!result.ok || !result.blob) {
        setBuildError(result.error || 'تعذر تحميل ملف APK');
        return;
      }

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showNotice(`تم تنزيل ملف ${finalFileName} بنجاح!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBuildError(`تعذر إتمام تحميل أو حفظ APK: ${msg}`);
    } finally {
      setIsDownloadingApk(false);
    }
  };

  const handleShareSavedApk = async () => {
    if (!savedApkNotice?.shareUri) return;
    const Share = getGlobalCapacitor()?.Plugins?.Share;
    if (!Share || typeof Share.share !== 'function') return;
    try {
      await Share.share({
        title: savedApkNotice.fileName,
        text: `تثبيت تطبيق ${savedApkNotice.fileName}`,
        url: savedApkNotice.shareUri,
        dialogTitle: 'حفظ في الملفات أو التثبيت عبر أداة تثبيت الحزم',
      });
    } catch {
      // user cancelled share sheet
    }
  };

  const handleEditBuild = (record: BuildRecord) => {
    setEditingBuildId(record.id);
    setPackageManuallyEdited(true);
    setConfig({
      appName: record.appName,
      packageName: record.packageName,
      versionName: record.versionName,
      iconDataUrl: record.iconDataUrl,
      permissions: { ...record.permissions },
    });
    setActiveTab('converter');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showNotice(`تم تحميل إعدادات "${record.appName}" للتعديل. ارفع ملف ZIP أو حمّل المشروع النموذجي لإعادة البناء.`);
  };

  const handleDeleteBuild = async (id: string) => {
    await removeBuildRecord(id);
    setBuilds((prev) => prev.filter((b) => b.id !== id));
    if (editingBuildId === id) setEditingBuildId(null);
  };

  const handleHistoryDownloadApk = (record: BuildRecord) => {
    if (!record.repoFullName || (!record.artifactId && !record.releaseAssetId)) return;
    const [owner, repo] = record.repoFullName.split('/');
    const baseName = sanitizeApkBaseName(record.appName, record.packageName);
    downloadApkFromGitHub({
      owner,
      repo,
      artifactId: record.artifactId,
      releaseAssetId: record.releaseAssetId,
      releaseAssetUrl: record.releaseAssetUrl,
      releaseDownloadUrl: record.releaseDownloadUrl,
      fileName: `${baseName}.apk`,
      appName: record.appName,
    });
  };

  // --- APK Decompiler & Source Extractor Handlers ---
  const updateDecompileStep = (
    stepId: DecompileStep['id'],
    status: DecompileStep['status'],
    detail?: string
  ) => {
    setDecompileSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, status, detail: detail ?? s.detail } : s))
    );
  };

  const handleApkFileSelected = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.apk')) {
      setApkInspectError('يرجى اختيار ملف تطبيق بصيغة .apk فقط.');
      return;
    }
    if (decompilePollTimerRef.current) {
      window.clearTimeout(decompilePollTimerRef.current);
    }
    setIsInspectingApk(true);
    setApkInspectError(null);
    setDecompileError(null);
    setDecompileFailedRunUrl(null);
    setDecompileErrorLogsTail([]);
    setReadyCloudZipInfo(null);
    setSavedZipNotice(null);
    setDecompileSteps(createInitialDecompileSteps());
    setDecompileProgressPct(0);

    try {
      const buf = await file.arrayBuffer();
      const result = await inspectAndExtractApk(buf, file.name);
      setApkInspection(result);
    } catch (err) {
      setApkInspection(null);
      setApkInspectError(err instanceof Error ? err.message : 'تعذر قراءة ملف APK');
    } finally {
      setIsInspectingApk(false);
    }
  };

  const handleStartJadxDecompile = async () => {
    if (!apkInspection || apkInspection.apkKind !== 'native-android') return;
    if (!githubToken.trim()) {
      setDecompileError('يرجى إدخال رمز GitHub الشخصي أولاً لتشغيل التفكيك السحابي عبر JADX.');
      return;
    }

    setDecompileError(null);
    setDecompileFailedRunUrl(null);
    setDecompileErrorLogsTail([]);
    setReadyCloudZipInfo(null);
    setSavedZipNotice(null);
    setIsDecompiling(true);
    setDecompileSteps(createInitialDecompileSteps());
    setDecompileProgressPct(10);

    try {
      updateDecompileStep('inspect_apk', 'active');
      const repoFiles = buildJadxRepoFiles(apkInspection.rawApkBytes);
      const encodedFiles = Object.entries(repoFiles).map(([path, content]) => ({
        path,
        contentBase64:
          typeof content === 'string' ? utf8ToBase64(content) : uint8ToBase64(content),
      }));
      updateDecompileStep('inspect_apk', 'done', 'تم تجهيز الحزمة وسير عمل decompile.yml بنجاح');
      setDecompileProgressPct(25);

      updateDecompileStep('create_repo', 'active');
      const repoName = `apk-decompile-${Date.now().toString(36)}`;
      const startData = await startGitHubBuildApi({
        token: githubToken.trim(),
        repoName,
        isPrivate: isPrivateRepo,
        files: encodedFiles,
      });
      if (!startData.ok || !startData.owner || !startData.repo) {
        updateDecompileStep('create_repo', 'error', startData.error || 'فشل إنشاء مستودع التفكيك');
        setDecompileError(startData.error || 'تعذر بدء عملية التفكيك السحابي.');
        setIsDecompiling(false);
        return;
      }

      updateDecompileStep('create_repo', 'done', `تم إنشاء المستودع ${startData.repoFullName}`);
      updateDecompileStep('push_apk', 'done', 'تم رفع ملف APK وسير عمل JADX بنجاح');
      updateDecompileStep('jadx_actions', 'active', 'بانتظار بدء خادم JADX على GitHub Actions...');
      setDecompileProgressPct(50);

      const buildOwner = startData.owner;
      const buildRepo = startData.repo;
      const buildRepoUrl = startData.repoUrl || '';

      const pollDecompileStatus = async (attempt: number) => {
        if (attempt > 90) {
          updateDecompileStep('jadx_actions', 'error', 'انتهت مهلة انتظار التفكيك؛ راجع حالة GitHub Actions');
          setDecompileError('استغرقت عملية JADX وقتاً أطول من المعتاد.');
          setIsDecompiling(false);
          return;
        }

        try {
          const stData = await fetchGitHubBuildStatusApi({
            token: githubToken.trim(),
            owner: buildOwner,
            repo: buildRepo,
            commitSha: startData.commitSha,
          });

          if (stData.found) {
            const activeStep = (stData.steps || []).find((s) => s.status === 'in_progress');
            const completedCount = (stData.steps || []).filter((s) => s.status === 'completed').length;
            const totalSteps = Math.max(1, (stData.steps || []).length);

            if (stData.status === 'completed') {
              if (stData.conclusion === 'success' && (stData.releaseAssetId || stData.artifactId)) {
                updateDecompileStep('jadx_actions', 'done', 'اكتمل تفكيك الكود المصدري عبر JADX بنجاح');
                updateDecompileStep('zip_ready', 'done', 'ملف الكود المصدري (.zip) جاهز للحفظ والمشاركة');
                setDecompileProgressPct(100);
                setReadyCloudZipInfo({
                  owner: buildOwner,
                  repo: buildRepo,
                  repoUrl: buildRepoUrl,
                  runUrl: stData.runUrl,
                  artifactId: stData.artifactId,
                  releaseAssetId: stData.releaseAssetId,
                  releaseAssetUrl: stData.releaseAssetUrl,
                  releaseDownloadUrl: stData.releaseDownloadUrl,
                  fileName: apkInspection.extractedZipFileName,
                });
                setIsDecompiling(false);
                return;
              } else {
                const failedStepLabel = stData.failedStepName
                  ? `فشل التفكيك في الخطوة: "${stData.failedStepName}" (${stData.failedStepConclusion || stData.conclusion || 'failure'})`
                  : `فشل التفكيك السحابي (${stData.conclusion || 'failure'})`;
                const fullMsg = stData.errorDetail
                  ? `${failedStepLabel} — ${stData.errorDetail}`
                  : failedStepLabel;
                updateDecompileStep('jadx_actions', 'error', failedStepLabel);
                setDecompileFailedRunUrl(stData.runUrl || null);
                setDecompileErrorLogsTail(stData.errorLogsTail || []);
                setDecompileError(fullMsg);
                setIsDecompiling(false);
                return;
              }
            } else {
              const pct = Math.min(92, 52 + Math.round((completedCount / totalSteps) * 40));
              setDecompileProgressPct(pct);
              if (activeStep) {
                updateDecompileStep('jadx_actions', 'active', `الخطوة الحالية: ${activeStep.name}`);
              }
            }
          }
        } catch {
          // ignore transient polling error
        }

        decompilePollTimerRef.current = window.setTimeout(() => pollDecompileStatus(attempt + 1), 4500);
      };

      decompilePollTimerRef.current = window.setTimeout(() => pollDecompileStatus(1), 3500);
    } catch (err) {
      setDecompileError(err instanceof Error ? err.message : 'حدث خطأ أثناء التفكيك السحابي');
      setIsDecompiling(false);
    }
  };

  const resolveExtractedZip = async (): Promise<{ blob: Blob; fileName: string } | null> => {
    if (apkInspection?.apkKind === 'web-hybrid' && apkInspection.extractedZipBlob) {
      return {
        blob: apkInspection.extractedZipBlob,
        fileName: apkInspection.extractedZipFileName,
      };
    }
    if (readyCloudZipInfo) {
      if (readyCloudZipInfo.cachedBlob) {
        return { blob: readyCloudZipInfo.cachedBlob, fileName: readyCloudZipInfo.fileName };
      }
      const res = await downloadGitHubSourceZipApi({
        token: githubToken.trim(),
        owner: readyCloudZipInfo.owner,
        repo: readyCloudZipInfo.repo,
        artifactId: readyCloudZipInfo.artifactId,
        releaseAssetId: readyCloudZipInfo.releaseAssetId,
        releaseAssetUrl: readyCloudZipInfo.releaseAssetUrl,
        releaseDownloadUrl: readyCloudZipInfo.releaseDownloadUrl,
        fileName: readyCloudZipInfo.fileName,
      });
      if (!res.ok || !res.blob) {
        setDecompileError(res.error || 'تعذر تحميل ملف الكود المصدري من GitHub.');
        return null;
      }
      setReadyCloudZipInfo((prev) => (prev ? { ...prev, cachedBlob: res.blob } : prev));
      return { blob: res.blob, fileName: readyCloudZipInfo.fileName };
    }
    return null;
  };

  const writeZipToCapacitorMobile = async (
    blob: Blob,
    fileName: string
  ): Promise<{ savedPath: string; shareUri?: string; savedDirectory: 'DOCUMENTS' | 'CACHE' }> => {
    const cap = getGlobalCapacitor();
    const Filesystem = cap?.Plugins?.Filesystem;
    if (!Filesystem) {
      throw new Error('Filesystem plugin unavailable');
    }
    try {
      await Filesystem.requestPermissions?.();
    } catch {
      // scoped storage fallback
    }

    const base64Data = await blobToBase64(blob);
    const documentsPath = `APK_Extracted/${fileName}`;
    try {
      const writeRes = await Filesystem.writeFile({
        path: documentsPath,
        data: base64Data,
        directory: 'DOCUMENTS',
        recursive: true,
      });
      return {
        savedDirectory: 'DOCUMENTS',
        savedPath: `Documents/${documentsPath}`,
        shareUri: writeRes.uri,
      };
    } catch {
      const cacheRes = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: 'CACHE',
        recursive: true,
      });
      return {
        savedDirectory: 'CACHE',
        savedPath: `Cache/${fileName}`,
        shareUri: cacheRes.uri,
      };
    }
  };

  const triggerBrowserZipDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSaveExtractedZip = async () => {
    setIsSavingZip(true);
    setDecompileError(null);
    setApkInspectError(null);
    try {
      const resolved = await resolveExtractedZip();
      if (!resolved) return;

      const cap = getGlobalCapacitor();
      const isNative = Boolean(cap?.isNativePlatform?.());
      const Filesystem = cap?.Plugins?.Filesystem;

      if (isNative && Filesystem) {
        const saved = await writeZipToCapacitorMobile(resolved.blob, resolved.fileName);
        const msg =
          saved.savedDirectory === 'DOCUMENTS'
            ? 'تم حفظ ملف الكود المصدري في مجلد Documents/APK_Extracted!'
            : 'تم تجهيز ملف الكود المصدري في ذاكرة التطبيق المؤقتة!';
        setSavedZipNotice({
          message: msg,
          savedPath: saved.savedPath,
          shareUri: saved.shareUri,
          fileName: resolved.fileName,
        });
        showNotice(msg);
      } else {
        triggerBrowserZipDownload(resolved.blob, resolved.fileName);
        const msg = `تم تنزيل ملف ${resolved.fileName} بنجاح — جاهز للرفع في Google AI Studio!`;
        setSavedZipNotice({
          message: msg,
          fileName: resolved.fileName,
        });
        showNotice(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setApkInspectError(`تعذر حفظ ملف الكود المصدري: ${msg}`);
    } finally {
      setIsSavingZip(false);
    }
  };

  const handleShareExtractedZip = async () => {
    setIsSavingZip(true);
    setDecompileError(null);
    setApkInspectError(null);
    try {
      const resolved = await resolveExtractedZip();
      if (!resolved) return;

      const cap = getGlobalCapacitor();
      const isNative = Boolean(cap?.isNativePlatform?.());
      const Share = cap?.Plugins?.Share;

      if (isNative && Share && typeof Share.share === 'function') {
        let shareUri = savedZipNotice?.shareUri;
        if (!shareUri) {
          const saved = await writeZipToCapacitorMobile(resolved.blob, resolved.fileName);
          shareUri = saved.shareUri;
          setSavedZipNotice({
            message: 'تم تجهيز الملف في Documents/APK_Extracted للمشاركة.',
            savedPath: saved.savedPath,
            shareUri: saved.shareUri,
            fileName: resolved.fileName,
          });
        }
        try {
          await Share.share({
            title: resolved.fileName,
            text: 'ملف الكود المصدري المستخرج (.zip) — جاهز للرفع والتعديل في Google AI Studio',
            url: shareUri,
            dialogTitle: 'مشاركة / فتح في AI Studio',
          });
        } catch {
          // user dismissed share sheet
        }
        return;
      }

      // Browser Web Share API with file fallback to direct download
      const zipFile = new File([resolved.blob], resolved.fileName, { type: 'application/zip' });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [zipFile] }))) {
        try {
          await nav.share({
            title: resolved.fileName,
            text: 'ملف الكود المصدري المستخرج (.zip) — جاهز للرفع في Google AI Studio',
            files: [zipFile],
          });
          return;
        } catch {
          // fall through to download if browser share aborted or unsupported
        }
      }

      triggerBrowserZipDownload(resolved.blob, resolved.fileName);
      showNotice('تم تنزيل ملف ZIP — يمكنك رفعه مباشرة في Google AI Studio للتعديل عليه.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setApkInspectError(`تعذر مشاركة ملف الكود المصدري: ${msg}`);
    } finally {
      setIsSavingZip(false);
    }
  };

  const pageTitle =
    activeTab === 'converter'
      ? 'تحويل مشروع ويب إلى تطبيق أندرويد (APK)'
      : activeTab === 'decompiler'
        ? 'مفكك ومستخرج كود APK للتعديل (ZIP)'
        : activeTab === 'history'
          ? 'سجل التطبيقات المصنوعة'
          : 'إعدادات الربط السحابي';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        historyCount={builds.length}
        githubLogin={githubUser?.login || null}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean Top Bar Contract */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeTab === 'converter' ? (
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <History className="w-4 h-4 text-slate-600" />
                <span>سجل التطبيقات ({builds.length})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('converter')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <FileArchive className="w-4 h-4" />
                <span>تحويل مشروع جديد</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
          {notice && (
            <div
              role="status"
              className="flex items-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900"
            >
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {activeTab === 'converter' && (
            <>
              <ZipDropzone
                analysis={analysis}
                isProcessing={zipProcessing}
                error={zipError}
                onFileSelected={handleFileSelected}
                onLoadSample={handleLoadSample}
              />

              <AppIdentityForm
                config={config}
                packageManuallyEdited={packageManuallyEdited}
                onAppNameChange={handleAppNameChange}
                onPackageNameChange={handlePackageNameChange}
                onRegeneratePackageName={handleRegeneratePackageName}
                onVersionChange={(versionName) =>
                  setConfig((prev) => ({ ...prev, versionName }))
                }
                onIconChange={(iconDataUrl) =>
                  setConfig((prev) => ({ ...prev, iconDataUrl }))
                }
              />

              <NativePermissionsPanel
                config={config}
                onChangePermissions={(permissions) =>
                  setConfig((prev) => ({ ...prev, permissions }))
                }
              />

              <CloudBuildPanel
                analysis={analysis}
                hasValidConfig={hasValidConfig}
                githubToken={githubToken}
                githubLogin={githubUser?.login || null}
                isBuilding={isBuilding}
                buildProgressPct={buildProgressPct}
                buildSteps={buildSteps}
                buildError={buildError}
                failedRunUrl={failedRunUrl}
                errorLogsTail={errorLogsTail}
                readyApkInfo={readyApkInfo}
                savedApkNotice={savedApkNotice}
                isDownloadingApk={isDownloadingApk}
                onOpenSettings={() => setActiveTab('settings')}
                onQuickSaveToken={async (token) => {
                  saveTokenOnly(token);
                  const res = await verifyToken(token);
                  if (!res.ok) {
                    setBuildError(
                      `تم حفظ الرمز محلياً، لكن تعذر التحقق من الاتصال: ${res.error || 'تعذر التحقق من الرمز'}`
                    );
                  } else {
                    setBuildError(null);
                    showNotice('تم حفظ الرمز بنجاح وربط حساب GitHub.');
                  }
                  return res;
                }}
                onStartCloudBuild={handleStartCloudBuild}
                onDownloadReadyApk={() => {
                  if (readyApkInfo) downloadApkFromGitHub(readyApkInfo);
                }}
                onShareSavedApk={handleShareSavedApk}
                onExportCapacitorZip={handleExportCapacitorZip}
              />
            </>
          )}

          {activeTab === 'decompiler' && (
            <ApkDecompilerView
              inspection={apkInspection}
              isInspecting={isInspectingApk}
              inspectError={apkInspectError}
              githubToken={githubToken}
              githubLogin={githubUser?.login || null}
              isDecompiling={isDecompiling}
              decompileProgressPct={decompileProgressPct}
              decompileSteps={decompileSteps}
              decompileError={decompileError}
              failedRunUrl={decompileFailedRunUrl}
              errorLogsTail={decompileErrorLogsTail}
              readyCloudZipInfo={readyCloudZipInfo}
              savedZipNotice={savedZipNotice}
              isSavingZip={isSavingZip}
              onApkFileSelected={handleApkFileSelected}
              onQuickSaveToken={async (token) => {
                saveTokenOnly(token);
                const res = await verifyToken(token);
                if (!res.ok) {
                  setDecompileError(
                    `تم حفظ الرمز محلياً، لكن تعذر التحقق من الاتصال: ${res.error || 'تعذر التحقق من الرمز'}`
                  );
                } else {
                  setDecompileError(null);
                  showNotice('تم حفظ الرمز بنجاح وربط حساب GitHub.');
                }
                return res;
              }}
              onOpenSettings={() => setActiveTab('settings')}
              onStartJadxDecompile={handleStartJadxDecompile}
              onSaveExtractedZip={handleSaveExtractedZip}
              onShareExtractedZip={handleShareExtractedZip}
            />
          )}

          {activeTab === 'history' && (
            <BuildHistoryView
              builds={builds}
              isLoading={buildsLoading}
              onEditBuild={handleEditBuild}
              onDownloadApk={handleHistoryDownloadApk}
              onDeleteBuild={handleDeleteBuild}
              onGoToConverter={() => setActiveTab('converter')}
            />
          )}

          {activeTab === 'settings' && (
            <CloudSettingsView
              githubToken={githubToken}
              githubUser={githubUser}
              tokenScopes={tokenScopes}
              isPrivateRepo={isPrivateRepo}
              onTogglePrivateRepo={handleTogglePrivateRepo}
              onSaveTokenLocal={saveTokenOnly}
              onVerifyAndSaveToken={verifyToken}
              onClearToken={handleClearToken}
            />
          )}
        </main>
      </div>
    </div>
  );
}
