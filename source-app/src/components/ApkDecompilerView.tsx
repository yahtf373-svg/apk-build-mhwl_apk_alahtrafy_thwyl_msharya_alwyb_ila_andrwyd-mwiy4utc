import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  ExternalLink,
  FileCode2,
  FolderTree,
  Globe,
  KeyRound,
  Loader2,
  PackageOpen,
  Share2,
  Upload,
} from 'lucide-react';
import type { ApkInspectionResult, DecompileStep } from '../types/apk';
import { formatBytes } from '../utils/packageUtils';

interface ApkDecompilerViewProps {
  inspection: ApkInspectionResult | null;
  isInspecting: boolean;
  inspectError: string | null;
  githubToken: string;
  githubLogin: string | null;
  isDecompiling: boolean;
  decompileProgressPct: number;
  decompileSteps: DecompileStep[];
  decompileError: string | null;
  failedRunUrl: string | null;
  errorLogsTail: string[];
  readyCloudZipInfo: {
    owner: string;
    repo: string;
    repoUrl: string;
    runUrl?: string;
    artifactId?: number;
    releaseAssetId?: number;
    releaseAssetUrl?: string;
    releaseDownloadUrl?: string;
    fileName: string;
  } | null;
  savedZipNotice: {
    message: string;
    savedPath?: string;
    shareUri?: string;
    fileName: string;
  } | null;
  isSavingZip: boolean;
  onApkFileSelected: (file: File) => void;
  onQuickSaveToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
  onOpenSettings: () => void;
  onStartJadxDecompile: () => void;
  onSaveExtractedZip: () => void;
  onShareExtractedZip: () => void;
}

export const ApkDecompilerView: React.FC<ApkDecompilerViewProps> = ({
  inspection,
  isInspecting,
  inspectError,
  githubToken,
  githubLogin,
  isDecompiling,
  decompileProgressPct,
  decompileSteps,
  decompileError,
  failedRunUrl,
  errorLogsTail,
  readyCloudZipInfo,
  savedZipNotice,
  isSavingZip,
  onApkFileSelected,
  onQuickSaveToken,
  onOpenSettings,
  onStartJadxDecompile,
  onSaveExtractedZip,
  onShareExtractedZip,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  const [inlineToken, setInlineToken] = useState(() => {
    try {
      return (
        localStorage.getItem('github_token') ||
        localStorage.getItem('apk_pro_github_pat') ||
        ''
      );
    } catch {
      return '';
    }
  });
  const [tokenSubmitting, setTokenSubmitting] = useState(false);
  const [inlineSavedMsg, setInlineSavedMsg] = useState<string | null>(null);

  const persistInlineToken = (val: string) => {
    try {
      const trimmed = val.trim();
      if (trimmed) {
        localStorage.setItem('github_token', trimmed);
        localStorage.setItem('apk_pro_github_pat', trimmed);
      }
    } catch {
      // ignore
    }
  };

  const handleSaveInlineToken = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    const currentValue = (inlineInputRef.current?.value ?? inlineToken).trim();
    if (!currentValue) return;
    persistInlineToken(currentValue);
    setInlineToken(currentValue);
    setInlineSavedMsg('تم حفظ الرمز بنجاح! جارٍ التحقق من الاتصال...');
    setTokenSubmitting(true);
    try {
      const res = await onQuickSaveToken(currentValue);
      if (res.ok) {
        setInlineSavedMsg('تم حفظ الرمز بنجاح!');
      } else {
        setInlineSavedMsg(null);
      }
    } finally {
      setTokenSubmitting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onApkFileSelected(file);
  };

  const isZipReady =
    (inspection?.apkKind === 'web-hybrid' && Boolean(inspection.extractedZipBlob)) ||
    Boolean(readyCloudZipInfo);

  const zipTargetFileName =
    readyCloudZipInfo?.fileName || inspection?.extractedZipFileName || 'extracted_source.zip';

  return (
    <div className="space-y-6">
      {/* 1. Upload APK Box */}
      <section
        aria-labelledby="decompiler-upload-title"
        className="bg-white border border-slate-200 rounded-xl p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 id="decompiler-upload-title" className="text-lg font-bold text-slate-900">
              مفكك ومستخرج كود APK للتعديل (APK Decompiler)
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              ارفع أي ملف .apk؛ يكتشف التطبيق نوعه تلقائياً ويستخرج كوده المصدري بصيغة .zip نظيفة جاهزة للرفع في Google AI Studio.
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".apk,application/vnd.android.package-archive"
          aria-label="اختيار ملف APK للتفكيك"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onApkFileSelected(f);
            e.target.value = '';
          }}
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-7 text-center transition-colors ${
            isDragging
              ? 'border-teal-600 bg-teal-50/50'
              : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
          }`}
        >
          <div className="mx-auto w-11 h-11 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-teal-700 mb-3">
            {isInspecting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Upload className="w-5 h-5" />
            )}
          </div>

          <p className="text-sm font-semibold text-slate-800">
            {isInspecting
              ? 'جارٍ فحص بنية ملف APK عبر JSZip...'
              : 'اسحب ملف التطبيق (.apk) وأفلته هنا'}
          </p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            استخراج فوري بدون إنترنت لتطبيقات Capacitor/Cordova/WebView، وتفكيك سحابي عبر JADX لتطبيقات Java/Kotlin الأصلية
          </p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isInspecting || isDecompiling}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50"
          >
            <PackageOpen className="w-4 h-4" />
            <span>اختيار ملف APK من الجهاز</span>
          </button>
        </div>

        {inspectError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{inspectError}</span>
          </div>
        )}
      </section>

      {/* 2. App Info & Detection Card */}
      {inspection && (
        <section
          aria-labelledby="apk-info-title"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          data-testid="apk-inspection-card"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 id="apk-info-title" className="text-base font-bold text-slate-900">
                  بطاقة فحص التطبيق
                </h3>
                {inspection.apkKind === 'web-hybrid' ? (
                  <span
                    data-testid="apk-badge-web"
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"
                  >
                    <Globe className="w-3.5 h-3.5 text-emerald-600" />
                    <span>تم اكتشاف تطبيق ويب (Capacitor/HTML) — استخراج فوري بدون إنترنت!</span>
                  </span>
                ) : (
                  <span
                    data-testid="apk-badge-native"
                    className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800"
                  >
                    <Cpu className="w-3.5 h-3.5 text-sky-600" />
                    <span>تم اكتشاف تطبيق أندرويد أصلي (Java/Kotlin Native) — يتطلب تفكيكاً سحابياً عبر JADX</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono" dir="ltr">
                {inspection.fileName} · {formatBytes(inspection.fileSizeBytes)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowFiles((s) => !s)}
              aria-expanded={showFiles}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>{showFiles ? 'إخفاء معاينة الملفات' : 'عرض معاينة الملفات'}</span>
              {showFiles ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="text-xs text-slate-500">اسم التطبيق</div>
              <div className="text-sm font-bold text-slate-900 mt-1 truncate">
                {inspection.detectedAppName}
              </div>
              {inspection.detectedPackageId && (
                <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate" dir="ltr">
                  {inspection.detectedPackageId}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="text-xs text-slate-500">نوع البناء</div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {inspection.frameworkLabel}
              </div>
              {inspection.webRootPrefix ? (
                <div className="text-[11px] font-mono text-emerald-700 mt-0.5" dir="ltr">
                  {inspection.webRootPrefix}
                </div>
              ) : (
                <div className="text-[11px] font-mono text-sky-700 mt-0.5" dir="ltr">
                  {inspection.dexFiles.join(', ')}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="text-xs text-slate-500">
                {inspection.apkKind === 'web-hybrid' ? 'ملفات الويب المستخرجة' : 'إجمالي ملفات الحزمة'}
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1 tabular-nums">
                {inspection.apkKind === 'web-hybrid'
                  ? `${inspection.extractedFilesCount} ملفاً`
                  : `${inspection.totalEntriesCount} ملفاً`}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {inspection.apkKind === 'web-hybrid'
                  ? 'تم نقل index.html إلى الجذر مباشرة'
                  : 'يشمل ملفات DEX والموارد (res)'}
              </div>
            </div>
          </div>

          {showFiles && (
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-200/70">
              {inspection.sampleEntries.map((entry) => (
                <div
                  key={entry.path}
                  className="flex items-center justify-between gap-4 px-3.5 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono text-slate-800 truncate" dir="ltr">
                      {entry.path}
                    </span>
                  </div>
                  <span dir="ltr" className="font-mono text-slate-500 tabular-nums shrink-0">
                    {formatBytes(entry.sizeBytes)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Case B: Native Android Cloud JADX Trigger */}
          {inspection.apkKind === 'native-android' && (
            <div className="pt-4 border-t border-slate-100 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  يستخدم التفكيك السحابي أداة <span className="font-mono font-semibold text-slate-800">JADX 1.5.1</span> لتحويل <span className="font-mono">classes.dex</span> إلى ملفات <span className="font-mono">src/</span> و <span className="font-mono">res/</span> قابلة للقراءة والتعديل.
                </div>
                {githubLogin ? (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
                  >
                    متصل بحساب @{githubLogin} · تغيير الرمز
                  </button>
                ) : null}
              </div>

              {!githubToken && (
                <form
                  onSubmit={handleSaveInlineToken}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <KeyRound className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        ربط رمز GitHub الشخصي لتشغيل JADX السحابي
                      </h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        أدخل Personal Access Token بصلاحيتي <span className="font-mono">repo</span> و{' '}
                        <span className="font-mono">workflow</span> لتفكيك الـ APK سحابياً.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      ref={inlineInputRef}
                      type="password"
                      dir="ltr"
                      value={inlineToken}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInlineToken(val);
                        persistInlineToken(val);
                      }}
                      onBlur={(e) => persistInlineToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      aria-label="رمز GitHub الشخصي للتفكيك"
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-mono text-left text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveInlineToken()}
                      disabled={tokenSubmitting || !inlineToken.trim()}
                      className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      {tokenSubmitting ? 'جارٍ التحقق...' : 'حفظ والتحقق من الرمز'}
                    </button>
                  </div>
                  {inlineSavedMsg && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                      <span>{inlineSavedMsg}</span>
                    </div>
                  )}
                </form>
              )}

              <div>
                <button
                  type="button"
                  onClick={onStartJadxDecompile}
                  disabled={isDecompiling || inspection.fileSizeBytes > 68 * 1024 * 1024}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDecompiling ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Cpu className="w-4 h-4" />
                  )}
                  <span>
                    {isDecompiling
                      ? 'جارٍ التفكيك السحابي عبر JADX...'
                      : 'تفكيك واستخراج الكود المصدري سحابياً (JADX)'}
                  </span>
                </button>
                {inspection.fileSizeBytes > 68 * 1024 * 1024 && (
                  <p className="text-xs text-red-700 mt-2">
                    حجم ملف APK يتجاوز حد الرفع المباشر عبر GitHub API (68 ميجابايت).
                  </p>
                )}
              </div>

              {decompileError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="font-semibold break-words">{decompileError}</div>
                      {failedRunUrl && (
                        <a
                          href={failedRunUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs underline text-red-700 hover:text-red-900"
                        >
                          <span>فتح سجل JADX على GitHub Actions</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {errorLogsTail.length > 0 && (
                    <pre
                      dir="ltr"
                      className="max-h-64 overflow-auto rounded-md bg-red-950 text-red-50 p-3 text-[11px] font-mono leading-relaxed text-left whitespace-pre-wrap break-words"
                    >
                      <code>{errorLogsTail.join('\n')}</code>
                    </pre>
                  )}
                </div>
              )}

              {(isDecompiling || decompileSteps.some((s) => s.status !== 'pending')) && (
                <div className="pt-4 border-t border-slate-100" data-testid="jadx-decompile-progress">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
                    <span>تقدّم عملية التفكيك السحابي (JADX)</span>
                    <span className="font-mono tabular-nums">{decompileProgressPct}%</span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden mb-5">
                    <div
                      className="h-full bg-sky-700 transition-all duration-300"
                      style={{ width: `${decompileProgressPct}%` }}
                    />
                  </div>

                  <ol className="space-y-3">
                    {decompileSteps.map((step, index) => (
                      <li key={step.id} className="flex items-start gap-3 text-sm">
                        <span className="mt-0.5 shrink-0">
                          {step.status === 'done' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : step.status === 'active' ? (
                            <Loader2 className="w-4 h-4 text-sky-700 animate-spin" />
                          ) : step.status === 'error' ? (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          ) : (
                            <span className="w-4 h-4 rounded-full border border-slate-300 inline-flex items-center justify-center text-[10px] font-mono text-slate-400 tabular-nums">
                              {index + 1}
                            </span>
                          )}
                        </span>
                        <div>
                          <div
                            className={`font-medium ${
                              step.status === 'pending' ? 'text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {step.label}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{step.detail}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Ready Extracted Source ZIP Banner (Case A instant OR Case B JADX completed) */}
          {isZipReady && (
            <div
              data-testid="extracted-zip-ready-banner"
              className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-base">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>
                      {inspection.apkKind === 'web-hybrid'
                        ? 'حزمة الكود المصدري (.zip) جاهزة للرفع في Google AI Studio!'
                        : 'اكتمل تفكيك الكود المصدري عبر JADX بنجاح!'}
                    </span>
                  </div>
                  <div className="text-xs text-emerald-800 mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono" dir="ltr">
                      {zipTargetFileName}
                    </span>
                    {readyCloudZipInfo && (
                      <>
                        <span>·</span>
                        <a
                          href={readyCloudZipInfo.runUrl || readyCloudZipInfo.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline hover:text-emerald-950"
                        >
                          <span>عرض سجل JADX على GitHub</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onSaveExtractedZip}
                    disabled={isSavingZip}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    {isSavingZip ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>{isSavingZip ? 'جارٍ الحفظ...' : 'حفظ ملف ZIP في الجوال'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onShareExtractedZip}
                    disabled={isSavingZip}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>مشاركة / فتح في AI Studio</span>
                  </button>

                  {readyCloudZipInfo?.releaseDownloadUrl && (
                    <button
                      type="button"
                      onClick={() => window.open(readyCloudZipInfo.releaseDownloadUrl, '_system')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>تنزيل مباشر عبر المتصفح</span>
                    </button>
                  )}
                </div>
              </div>

              {savedZipNotice && (
                <div
                  role="status"
                  className="rounded-lg border border-emerald-300 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-emerald-800">
                      {savedZipNotice.message}
                    </div>
                    {savedZipNotice.savedPath && (
                      <div
                        dir="ltr"
                        className="text-xs font-mono text-slate-500 mt-0.5 truncate text-right"
                      >
                        {savedZipNotice.savedPath}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
