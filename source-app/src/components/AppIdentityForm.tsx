import React, { useRef } from 'react';
import { Image as ImageIcon, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import type { AppConfig } from '../types/apk';
import {
  computeVersionCode,
  validatePackageName,
  validateVersionName,
} from '../utils/packageUtils';

interface AppIdentityFormProps {
  config: AppConfig;
  packageManuallyEdited: boolean;
  onAppNameChange: (name: string) => void;
  onPackageNameChange: (pkg: string) => void;
  onRegeneratePackageName: () => void;
  onVersionChange: (version: string) => void;
  onIconChange: (dataUrl: string | null) => void;
}

export const AppIdentityForm: React.FC<AppIdentityFormProps> = ({
  config,
  packageManuallyEdited,
  onAppNameChange,
  onPackageNameChange,
  onRegeneratePackageName,
  onVersionChange,
  onIconChange,
}) => {
  const iconInputRef = useRef<HTMLInputElement>(null);
  const pkgValidation = validatePackageName(config.packageName);
  const verValidation = validateVersionName(config.versionName);
  const versionCode = computeVersionCode(config.versionName);

  const handleIconFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Normalize uploaded icon into a crisp 512x512 square PNG canvas
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 512, 512);
          onIconChange(canvas.toDataURL('image/png'));
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const renderFallbackIconGlyph = (sizeClass: string) => {
    const firstChar = (config.appName.trim()[0] || 'أ').toUpperCase();
    return (
      <div
        className={`${sizeClass} bg-teal-700 text-white flex items-center justify-center font-display font-bold select-none`}
      >
        {firstChar}
      </div>
    );
  };

  return (
    <section
      aria-labelledby="identity-section-title"
      className="bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="mb-5">
        <h2 id="identity-section-title" className="text-lg font-bold text-slate-900">
          2. هوية التطبيق والأيقونة
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          حدّد الاسم المعروض على الهاتف ومعرّف الحزمة الفريد ورقم الإصدار وأيقونة الإطلاق.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 space-y-4">
          <div>
            <label
              htmlFor="app-name-input"
              className="block text-sm font-medium text-slate-800 mb-1.5"
            >
              اسم التطبيق (بالعربي أو الإنجليزي)
            </label>
            <input
              id="app-name-input"
              type="text"
              value={config.appName}
              onChange={(e) => onAppNameChange(e.target.value)}
              placeholder="مثال: رفيق التلاوة والحفظ"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="package-name-input"
                className="block text-sm font-medium text-slate-800"
              >
                معرّف الحزمة (Package Name)
              </label>
              {packageManuallyEdited && (
                <button
                  type="button"
                  onClick={onRegeneratePackageName}
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>توليد تلقائي من الاسم</span>
                </button>
              )}
            </div>
            <input
              id="package-name-input"
              type="text"
              dir="ltr"
              value={config.packageName}
              onChange={(e) => onPackageNameChange(e.target.value)}
              placeholder="com.myapp.quran"
              className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm font-mono text-left text-slate-900 focus:outline-none focus:ring-2 ${
                pkgValidation.valid
                  ? 'border-slate-300 focus:border-teal-700 focus:ring-teal-700/15'
                  : 'border-red-400 focus:border-red-500 focus:ring-red-500/15'
              }`}
            />
            {!pkgValidation.valid && (
              <p className="text-xs text-red-600 mt-1">{pkgValidation.reason}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="version-name-input"
                className="block text-sm font-medium text-slate-800 mb-1.5"
              >
                رقم الإصدار (Version)
              </label>
              <input
                id="version-name-input"
                type="text"
                dir="ltr"
                value={config.versionName}
                onChange={(e) => onVersionChange(e.target.value)}
                placeholder="1.0.0"
                className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm font-mono text-left text-slate-900 tabular-nums focus:outline-none focus:ring-2 ${
                  verValidation.valid
                    ? 'border-slate-300 focus:border-teal-700 focus:ring-teal-700/15'
                    : 'border-red-400 focus:border-red-500 focus:ring-red-500/15'
                }`}
              />
              {!verValidation.valid ? (
                <p className="text-xs text-red-600 mt-1">{verValidation.reason}</p>
              ) : (
                <p className="text-xs text-slate-500 mt-1 tabular-nums">
                  رمز البناء الداخلي (versionCode): {versionCode}
                </p>
              )}
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-800 mb-1.5">
                أيقونة التطبيق (صورة مربعة)
              </span>
              <input
                ref={iconInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                aria-label="رفع أيقونة التطبيق"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleIconFile(f);
                  e.target.value = '';
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => iconInputRef.current?.click()}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 transition-colors whitespace-nowrap"
                >
                  <ImageIcon className="w-4 h-4 text-teal-700" />
                  <span>{config.iconDataUrl ? 'تغيير الأيقونة' : 'رفع صورة أيقونة'}</span>
                </button>
                {config.iconDataUrl && (
                  <button
                    type="button"
                    onClick={() => onIconChange(null)}
                    aria-label="إزالة الأيقونة المخصصة"
                    className="p-2.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                يُفضّل 512×512 بكسل بصيغة PNG
              </p>
            </div>
          </div>
        </div>

        {/* Live Square & Circular Android Launcher Icon Preview */}
        <div className="xl:col-span-5 rounded-xl bg-slate-50 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-500" />
              <span>معاينة شاشة الهاتف (مربع ودائري)</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-3 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-200 shadow-xs mb-2.5">
                {config.iconDataUrl ? (
                  <img
                    src={config.iconDataUrl}
                    alt="معاينة الأيقونة المربعة"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  renderFallbackIconGlyph('w-full h-full text-2xl')
                )}
              </div>
              <span className="text-xs font-semibold text-slate-900 truncate max-w-full">
                {config.appName || 'اسم التطبيق'}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5">الشكل المربع</span>
            </div>

            <div className="p-3 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full overflow-hidden border border-slate-200 shadow-xs mb-2.5">
                {config.iconDataUrl ? (
                  <img
                    src={config.iconDataUrl}
                    alt="معاينة الأيقونة الدائرية"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  renderFallbackIconGlyph('w-full h-full text-2xl')
                )}
              </div>
              <span className="text-xs font-semibold text-slate-900 truncate max-w-full">
                {config.appName || 'اسم التطبيق'}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5">الشكل الدائري</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
