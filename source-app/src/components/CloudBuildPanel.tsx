import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileArchive,
  KeyRound,
  Loader2,
  Rocket,
  Share2,
} from 'lucide-react';
import type { CloudBuildStep, ZipAnalysisResult } from '../types/apk';

interface CloudBuildPanelProps {
  analysis: ZipAnalysisResult | null;
  hasValidConfig: boolean;
  githubToken: string;
  githubLogin: string | null;
  isBuilding: boolean;
  buildProgressPct: number;
  buildSteps: CloudBuildStep[];
  buildError: string | null;
  failedRunUrl?: string | null;
  errorLogsTail?: string[];
  readyApkInfo: {
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
  savedApkNotice?: {
    message: string;
    savedPath?: string;
    shareUri?: string;
    fileName: string;
  } | null;
  isDownloadingApk: boolean;
  onOpenSettings: () => void;
  onQuickSaveToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
  onStartCloudBuild: () => void;
  onDownloadReadyApk: () => void;
  onShareSavedApk?: () => void;
  onExportCapacitorZip: () => void;
}

export const CloudBuildPanel: React.FC<CloudBuildPanelProps> = ({
  analysis,
  hasValidConfig,
  githubToken,
  githubLogin,
  isBuilding,
  buildProgressPct,
  buildSteps,
  buildError,
  failedRunUrl,
  errorLogsTail,
  readyApkInfo,
  savedApkNotice,
  isDownloadingApk,
  onOpenSettings,
  onQuickSaveToken,
  onStartCloudBuild,
  onDownloadReadyApk,
  onShareSavedApk,
  onExportCapacitorZip,
}) => {
  const inlineInputRef = React.useRef<HTMLInputElement>(null);
  const [inlineToken, setInlineToken] = React.useState(() => {
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
  const [tokenSubmitting, setTokenSubmitting] = React.useState(false);
  const [inlineSavedMsg, setInlineSavedMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const saved =
        localStorage.getItem('github_token') ||
        localStorage.getItem('apk_pro_github_pat') ||
        '';
      if (saved) setInlineToken(saved);
    } catch {
      // ignore
    }
  }, []);

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

  return (
    <section
      aria-labelledby="cloud-build-title"
      className="bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 id="cloud-build-title" className="text-lg font-bold text-slate-900">
            4. محرك البناء السحابي وتوليد APK
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            يرفع المشروع (سواء HTML جاهز أو React / Vite / TypeScript) ويبنيه سحابياً مع كافة صلاحيات WebView وإضافات Capacitor 6.
          </p>
        </div>

        {githubLogin ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
          >
            متصل بحساب @{githubLogin} · تغيير الرمز
          </button>
        ) : githubToken ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
          >
            تم حفظ الرمز محلياً · تعديل أو التحقق
          </button>
        ) : null}
      </div>

      {/* One-time GitHub Token Setup if not yet connected */}
      {!githubToken && (
        <form
          onSubmit={handleSaveInlineToken}
          className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <div className="flex items-start gap-3 mb-3">
            <KeyRound className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                ربط رمز GitHub الشخصي (مرة واحدة فقط)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                أدخل Personal Access Token بصلاحيتي <span className="font-mono">repo</span> و{' '}
                <span className="font-mono">workflow</span> لتشغيل البناء السحابي تلقائياً.
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
              aria-label="رمز GitHub الشخصي"
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

      {/* Primary Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onStartCloudBuild}
          disabled={!analysis || !hasValidConfig || isBuilding}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBuilding ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Rocket className="w-4 h-4" />
          )}
          <span>{isBuilding ? 'جارٍ البناء السحابي...' : 'بناء وتصدير ملف APK'}</span>
        </button>

        <button
          type="button"
          onClick={onExportCapacitorZip}
          disabled={!analysis || !hasValidConfig || isBuilding}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileArchive className="w-4 h-4 text-slate-600" />
          <span>تصدير حزمة Capacitor (ZIP)</span>
        </button>
      </div>

      {!analysis && (
        <p className="text-xs text-slate-500 mt-3">
          ارفع ملف ZIP في الخطوة الأولى (أو حمّل المشروع النموذجي) لتفعيل أزرار البناء والتصدير.
        </p>
      )}

      {buildError && (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <div className="min-w-0 space-y-1 flex-1">
              <div className="font-semibold break-words">{buildError}</div>
              {failedRunUrl && (
                <a
                  href={failedRunUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs underline text-red-700 hover:text-red-900"
                >
                  <span>فتح سجل التشغيل على GitHub Actions</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {errorLogsTail && errorLogsTail.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-red-900">
                آخر {errorLogsTail.length} سطراً من سجل الخطوة الفاشلة:
              </div>
              <pre
                dir="ltr"
                className="max-h-72 overflow-auto rounded-md bg-red-950 text-red-50 p-3 text-[11px] font-mono leading-relaxed text-left whitespace-pre-wrap break-words"
              >
                <code>{errorLogsTail.join('\n')}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Live Cloud Build Stepper */}
      {(isBuilding || buildSteps.some((s) => s.status !== 'pending')) && (
        <div className="mt-6 pt-5 border-t border-slate-100" data-testid="cloud-build-progress">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
            <span>تقدّم عملية البناء السحابي</span>
            <span className="font-mono tabular-nums">{buildProgressPct}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden mb-5">
            <div
              className="h-full bg-teal-700 transition-all duration-300"
              style={{ width: `${buildProgressPct}%` }}
            />
          </div>

          <ol className="space-y-3">
            {buildSteps.map((step, index) => (
              <li
                key={step.id}
                className="flex items-start justify-between gap-4 text-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">
                    {step.status === 'done' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : step.status === 'active' ? (
                      <Loader2 className="w-4 h-4 text-teal-700 animate-spin" />
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
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Ready APK Download Banner */}
      {readyApkInfo && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-base">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>تم بناء وتوقيع ملف APK بنجاح</span>
              </div>
              <div className="text-xs text-emerald-800 mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono">{readyApkInfo.fileName}</span>
                <span>·</span>
                <a
                  href={readyApkInfo.runUrl || readyApkInfo.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline hover:text-emerald-950"
                >
                  <span>عرض سجل GitHub Actions</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onDownloadReadyApk}
                disabled={isDownloadingApk}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                {isDownloadingApk ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{isDownloadingApk ? 'جارٍ الحفظ والتحميل...' : 'تحميل ملف APK الجاهز'}</span>
              </button>

              {(readyApkInfo.releaseDownloadUrl || readyApkInfo.repoUrl) && (
                <button
                  type="button"
                  onClick={() => {
                    const directUrl =
                      readyApkInfo.releaseDownloadUrl || `${readyApkInfo.repoUrl}/releases`;
                    if (directUrl) window.open(directUrl, '_system');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>تنزيل مباشر عبر متصفح الجوال</span>
                </button>
              )}
            </div>
          </div>

          {savedApkNotice && (
            <div
              role="status"
              className="rounded-lg border border-emerald-300 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-emerald-800">
                  {savedApkNotice.message}
                </div>
                {savedApkNotice.savedPath && (
                  <div dir="ltr" className="text-xs font-mono text-slate-500 mt-0.5 truncate text-right">
                    {savedApkNotice.savedPath}
                  </div>
                )}
              </div>

              {savedApkNotice.shareUri && onShareSavedApk && (
                <button
                  type="button"
                  onClick={onShareSavedApk}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>مشاركة / تثبيت سريع</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
