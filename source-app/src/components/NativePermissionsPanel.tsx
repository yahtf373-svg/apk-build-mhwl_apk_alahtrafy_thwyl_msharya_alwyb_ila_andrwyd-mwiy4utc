import React, { useState } from 'react';
import {
  Code2,
  Download,
  Maximize2,
  Mic,
  RotateCw,
  Share2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { AppConfig, NativePermissions, OrientationMode } from '../types/apk';
import {
  generateAndroidManifestXml,
  generateGitHubWorkflowYaml,
  generateMainActivityJava,
} from '../utils/capacitorGenerator';

interface NativePermissionsPanelProps {
  config: AppConfig;
  onChangePermissions: (next: NativePermissions) => void;
}

type CodeTab = 'java' | 'manifest' | 'workflow';

export const NativePermissionsPanel: React.FC<NativePermissionsPanelProps> = ({
  config,
  onChangePermissions,
}) => {
  const { permissions } = config;
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [codeTab, setCodeTab] = useState<CodeTab>('java');

  const toggle = (key: 'gallerySave' | 'nativeShare' | 'microphone' | 'fullscreen') => {
    onChangePermissions({
      ...permissions,
      [key]: !permissions[key],
    });
  };

  const setOrientation = (orientation: OrientationMode) => {
    onChangePermissions({
      ...permissions,
      orientation,
    });
  };

  const permissionItems: Array<{
    key: 'gallerySave' | 'nativeShare' | 'microphone' | 'fullscreen';
    title: string;
    technicalLabel: string;
    description: string;
    icon: React.ReactNode;
    enabled: boolean;
  }> = [
    {
      key: 'gallerySave',
      title: 'حفظ الصور والملفات في المعرض والتنزيلات',
      technicalLabel: 'MediaStore · DownloadManager · READ_MEDIA_*',
      description:
        'تحويل روابط blob: و data:image وحفظ الصور والملفات مباشرة في استوديو الجوال ومجلد التنزيلات.',
      icon: <Download className="w-4 h-4 text-teal-700" />,
      enabled: permissions.gallerySave,
    },
    {
      key: 'nativeShare',
      title: 'نافذة المشاركة الأصلية',
      technicalLabel: 'Native Android Share Bridge · FileProvider',
      description:
        'ربط navigator.share بنافذة المشاركة الأصلية للأندرويد لمشاركة الصور والنصوص عبر واتساب وتيليجرام.',
      icon: <Share2 className="w-4 h-4 text-teal-700" />,
      enabled: permissions.nativeShare,
    },
    {
      key: 'microphone',
      title: 'الكاميرا والميكروفون والموقع (WebView)',
      technicalLabel: 'CAMERA · RECORD_AUDIO · GEOLOCATION · WebChromeClient',
      description:
        'تفعيل أذونات الكاميرا والميكروفون والموقع الجغرافي تلقائياً داخل WebView مع طلب الأذونات الحية عند التشغيل.',
      icon: <Mic className="w-4 h-4 text-teal-700" />,
      enabled: permissions.microphone,
    },
    {
      key: 'fullscreen',
      title: 'وضع ملء الشاشة (Edge-to-Edge)',
      technicalLabel: 'WindowCompat · WindowInsetsControllerCompat',
      description:
        'عرض التطبيق على كامل الشاشة مع إخفاء أشرطة النظام واستغلال الحواف بشكل عصري.',
      icon: <Maximize2 className="w-4 h-4 text-teal-700" />,
      enabled: permissions.fullscreen,
    },
  ];

  const previewSource =
    codeTab === 'java'
      ? generateMainActivityJava(config)
      : codeTab === 'manifest'
        ? generateAndroidManifestXml(config)
        : generateGitHubWorkflowYaml(config);

  return (
    <section
      aria-labelledby="permissions-section-title"
      className="bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h2 id="permissions-section-title" className="text-lg font-bold text-slate-900">
            3. الصلاحيات الأصلية وحلول قيود WebView
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            تُحقن جميع صلاحيات الكاميرا والميكروفون والموقع والتخزين تلقائياً في MainActivity.java و AndroidManifest.xml.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCodePreview((v) => !v)}
          aria-expanded={showCodePreview}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Code2 className="w-4 h-4 text-slate-500" />
          <span>{showCodePreview ? 'إخفاء معاينة الكود الأصلي' : 'معاينة الكود الأصلي المُولّد'}</span>
          {showCodePreview ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {permissionItems.map((item) => (
          <div
            key={item.key}
            className={`rounded-xl border p-4 transition-colors ${
              item.enabled
                ? 'border-teal-200 bg-teal-50/35'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">
                    {item.title}
                  </div>
                  <div
                    dir="ltr"
                    className="text-[11px] font-mono text-slate-500 mt-0.5 truncate text-right"
                  >
                    {item.technicalLabel}
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={item.enabled}
                aria-label={item.title}
                onClick={() => toggle(item.key)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                  item.enabled ? 'bg-teal-700' : 'bg-slate-300'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-150 ${
                    item.enabled ? '-translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              {item.description}
            </p>
          </div>
        ))}
      </div>

      {/* Screen Orientation Control */}
      <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <RotateCw className="w-4 h-4 text-slate-500 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-slate-800">اتجاه ودوران الشاشة</div>
            <div className="text-xs text-slate-500">
              التحكم في السماح بدوران الشاشة أو تثبيتها في AndroidManifest.xml
            </div>
          </div>
        </div>

        <div
          role="group"
          aria-label="اختيار اتجاه الشاشة"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
        >
          {(
            [
              { id: 'unspecified', label: 'دوران تلقائي' },
              { id: 'portrait', label: 'عمودي ثابت' },
              { id: 'landscape', label: 'أفقي ثابت' },
            ] as Array<{ id: OrientationMode; label: string }>
          ).map((opt) => {
            const active = permissions.orientation === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setOrientation(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {showCodePreview && (
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'java', label: 'MainActivity.java' },
                  { id: 'manifest', label: 'AndroidManifest.xml' },
                  { id: 'workflow', label: 'build.yml' },
                ] as Array<{ id: CodeTab; label: string }>
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCodeTab(t.id)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors whitespace-nowrap ${
                    codeTab === t.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">
              يتحدّث الكود فورياً حسب الصلاحيات المختارة
            </span>
          </div>

          <pre
            dir="ltr"
            className="max-h-72 overflow-auto rounded-lg bg-slate-900 text-slate-100 p-4 text-xs font-mono leading-relaxed text-left"
          >
            <code>{previewSource}</code>
          </pre>
        </div>
      )}
    </section>
  );
};
