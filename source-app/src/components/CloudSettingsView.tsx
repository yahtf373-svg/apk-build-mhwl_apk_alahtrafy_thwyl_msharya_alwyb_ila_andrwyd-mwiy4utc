import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Lock,
  Trash2,
} from 'lucide-react';
import type { GitHubUserInfo } from '../types/apk';

const TOKEN_STORAGE_KEY = 'github_token';

function readLocalToken(): string {
  try {
    return (
      localStorage.getItem(TOKEN_STORAGE_KEY) ||
      localStorage.getItem('apk_pro_github_pat') ||
      ''
    );
  } catch {
    return '';
  }
}

function writeLocalToken(value: string): void {
  try {
    const trimmed = value.trim();
    if (trimmed) {
      localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
      localStorage.setItem('apk_pro_github_pat', trimmed);
    }
  } catch {
    // ignore storage quota
  }
}

interface CloudSettingsViewProps {
  githubToken: string;
  githubUser: GitHubUserInfo | null;
  tokenScopes: string[];
  isPrivateRepo: boolean;
  onTogglePrivateRepo: (isPrivate: boolean) => void;
  onSaveTokenLocal: (token: string) => void;
  onVerifyAndSaveToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
  onClearToken: () => void;
}

export const CloudSettingsView: React.FC<CloudSettingsViewProps> = ({
  githubToken,
  githubUser,
  tokenScopes,
  isPrivateRepo,
  onTogglePrivateRepo,
  onSaveTokenLocal,
  onVerifyAndSaveToken,
  onClearToken,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tokenInput, setTokenInput] = useState<string>(() => githubToken || readLocalToken());
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Restore saved token from localStorage on mount / prop sync
  useEffect(() => {
    const savedToken = readLocalToken() || githubToken;
    if (savedToken) {
      setTokenInput(savedToken);
    }
  }, [githubToken]);

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tokenValue = e.target.value;
    setTokenInput(tokenValue);
    if (tokenValue.trim()) {
      writeLocalToken(tokenValue);
    }
  };

  const handleTokenBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const tokenValue = e.target.value;
    if (tokenValue.trim()) {
      writeLocalToken(tokenValue);
    }
  };

  const handleSaveAndVerify = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    const rawValue = inputRef.current?.value ?? tokenInput;
    const trimmedToken = rawValue.trim();

    if (!trimmedToken) {
      setStatusMsg({ type: 'err', text: 'يرجى إدخال رمز GitHub الشخصي أولاً.' });
      return;
    }

    // 1. Save immediately in localStorage & parent state before async verification
    writeLocalToken(trimmedToken);
    setTokenInput(trimmedToken);
    onSaveTokenLocal(trimmedToken);

    // 2. Show immediate green confirmation message before starting API verification
    setStatusMsg({
      type: 'ok',
      text: 'تم حفظ الرمز بنجاح! جارٍ التحقق من الاتصال بحساب GitHub...',
    });
    setVerifying(true);

    try {
      const result = await onVerifyAndSaveToken(trimmedToken);
      if (result.ok) {
        setStatusMsg({
          type: 'ok',
          text: 'تم حفظ الرمز بنجاح! الاتصال بحساب GitHub نشط وجاهز للبناء.',
        });
      } else {
        setStatusMsg({
          type: 'err',
          text: `تم حفظ الرمز بنجاح في المتصفح، لكن تعذر التحقق من الاتصال: ${result.error || 'تعذر التحقق من الرمز.'}`,
        });
      }
    } catch {
      setStatusMsg({
        type: 'err',
        text: 'تم حفظ الرمز بنجاح في المتصفح، لكن تعذر الاتصال بخادم التحقق حالياً.',
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              إعدادات الربط السحابي (GitHub API)
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              يُحفظ رمز الوصول الشخصي (PAT) في متصفحك لمرة واحدة فقط لتشغيل مستودعات البناء وتوقيع APK.
            </p>
          </div>
        </div>

        {githubUser && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src={githubUser.avatar_url}
                alt={githubUser.login}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full border border-emerald-200"
              />
              <div>
                <div className="text-sm font-bold text-slate-900">
                  {githubUser.name || githubUser.login}{' '}
                  <span dir="ltr" className="font-mono text-xs text-emerald-800">
                    @{githubUser.login}
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {tokenScopes.length > 0
                    ? `الصلاحيات النشطة: ${tokenScopes.join(' · ')}`
                    : 'الرمز متصل بنجاح وجاهز لتشغيل GitHub Actions'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClearToken();
                setTokenInput('');
                setStatusMsg(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>إزالة الرمز</span>
            </button>
          </div>
        )}

        <form onSubmit={handleSaveAndVerify} className="space-y-4">
          <div>
            <label
              htmlFor="github-pat-input"
              className="block text-sm font-medium text-slate-800 mb-1.5"
            >
              رمز الوصول الشخصي (Personal Access Token)
            </label>
            <input
              ref={inputRef}
              id="github-pat-input"
              type="password"
              dir="ltr"
              value={tokenInput}
              onChange={handleTokenChange}
              onBlur={handleTokenBlur}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-left text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>

          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-slate-500" />
              <div>
                <div className="text-sm font-medium text-slate-800">
                  إنشاء مستودعات البناء كمستودعات خاصة (Private)
                </div>
                <div className="text-xs text-slate-500">
                  يُوصى بتفعيله لحماية كود تطبيقك وأصوله أثناء الترجمة في GitHub Actions.
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isPrivateRepo}
              aria-label="إنشاء مستودعات بناء خاصة"
              onClick={() => onTogglePrivateRepo(!isPrivateRepo)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                isPrivateRepo ? 'bg-teal-700' : 'bg-slate-300'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-150 ${
                  isPrivateRepo ? '-translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {statusMsg && (
            <div
              role="alert"
              className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
                statusMsg.type === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {statusMsg.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => handleSaveAndVerify()}
              disabled={verifying}
              className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {verifying ? 'جارٍ التحقق من الصلاحيات...' : 'حفظ والتحقق من الاتصال'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-base font-bold text-slate-900 mb-3">
          خطوات استخراج رمز GitHub الصحيح
        </h3>
        <ol className="space-y-2.5 text-sm text-slate-600 list-decimal list-inside leading-relaxed">
          <li>
            افتح صفحة{' '}
            <a
              href="https://github.com/settings/tokens/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline"
            >
              <span>GitHub Classic Tokens</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>{' '}
            وسجّل الدخول بحسابك.
          </li>
          <li>
            اختر صلاحية <span className="font-mono text-slate-800">repo</span> وصلاحية{' '}
            <span className="font-mono text-slate-800">workflow</span> ليتمكن المحرّك من رفع ملفات Capacitor وتشغيل GitHub Actions.
          </li>
          <li>
            انسخ الرمز والصقه أعلاه لمرة واحدة فقط؛ بعدها يكفي ضغطة زر لبناء أي تطبيق جديد.
          </li>
        </ol>
      </section>
    </div>
  );
};
