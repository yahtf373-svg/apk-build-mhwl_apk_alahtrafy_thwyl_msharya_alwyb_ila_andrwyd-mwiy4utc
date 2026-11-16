import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCode2,
  FolderTree,
  PackageCheck,
  Upload,
  AlertCircle,
} from 'lucide-react';
import type { ZipAnalysisResult } from '../types/apk';
import { formatBytes } from '../utils/packageUtils';

interface ZipDropzoneProps {
  analysis: ZipAnalysisResult | null;
  isProcessing: boolean;
  error: string | null;
  onFileSelected: (file: File) => void;
  onLoadSample: () => void;
}

export const ZipDropzone: React.FC<ZipDropzoneProps> = ({
  analysis,
  isProcessing,
  error,
  onFileSelected,
  onLoadSample,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <section
      aria-labelledby="zip-section-title"
      className="bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h2 id="zip-section-title" className="text-lg font-bold text-slate-900">
            1. رفع وفحص حزمة المشروع (ZIP)
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            ارفع ملف الـ ZIP لمشروع React / Vite / TypeScript أو HTML؛ يفحصه النظام ويترجمه تلقائياً داخل السحابة.
          </p>
        </div>

        <button
          type="button"
          onClick={onLoadSample}
          disabled={isProcessing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50"
        >
          <PackageCheck className="w-3.5 h-3.5 text-teal-700" />
          <span>تجربة بمشروع نموذجي</span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        aria-label="اختيار ملف ZIP للمشروع"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelected(f);
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
          <Upload className="w-5 h-5" />
        </div>

        <p className="text-sm font-semibold text-slate-800">
          {isProcessing
            ? 'جارٍ فحص الملفات وإعادة ضبط المسارات...'
            : 'اسحب ملف المشروع المضغوط (.zip) وأفلته هنا'}
        </p>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          يدعم مشاريع React / Vite / TypeScript المصدرية (npm run build) أو صفحات HTML/JS الجاهزة
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isProcessing}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50"
        >
          اختيار ملف ZIP من الجهاز
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {analysis && (
        <div className="mt-5 pt-5 border-t border-slate-100" data-testid="zip-analysis-summary">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-slate-900 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                    {analysis.fileName}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="tabular-nums text-xs text-slate-600">
                    {analysis.fileCount} ملفاً
                  </span>
                  <span className="text-slate-400">·</span>
                  <span dir="ltr" className="tabular-nums text-xs text-slate-600">
                    {formatBytes(analysis.totalBytes)}
                  </span>
                </div>

                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  {analysis.hasBuildScript ? (
                    <>
                      تم اكتشاف مشروع مصدري قابل للبناء (<span className="font-mono text-slate-800">React / Vite / TypeScript</span>)؛ سيتولى المصنع السحابي تثبيت الحزم وبناءه بمسارات <span className="font-mono text-teal-800">./</span> تلقائياً قبل التغليف في APK.
                    </>
                  ) : analysis.wasReorganized ? (
                    <>
                      تم اكتشاف <span className="font-mono text-slate-800">{analysis.discoveredIndexPath}</span> داخل مجلد فرعي؛ جرى نقله تلقائياً إلى الجذر الرئيسي وتصحيح مسارات الأصول في{' '}
                      <span className="tabular-nums font-semibold text-teal-800">
                        {analysis.rewrittenFilesCount}
                      </span>{' '}
                      ملفاً بنجاح.
                    </>
                  ) : (
                    <>
                      تم التحقق من وجود <span className="font-mono text-slate-800">index.html</span> في الجذر الرئيسي وتهيئة المسارات النسبية لبيئة Android WebView.
                    </>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowFiles((s) => !s)}
              aria-expanded={showFiles}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>{showFiles ? 'إخفاء شجرة الملفات' : 'عرض شجرة الملفات'}</span>
              {showFiles ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showFiles && (
            <div className="mt-4 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-200/70">
              {analysis.entries.map((entry) => (
                <div
                  key={entry.normalizedPath}
                  className="flex items-center justify-between gap-4 px-3.5 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono text-slate-800 truncate" dir="ltr">
                      {analysis.hasBuildScript ? 'source-app/' : 'www/'}{entry.normalizedPath}
                    </span>
                    {entry.rewritten && (
                      <span className="text-[11px] text-teal-700 font-medium shrink-0">
                        · مسارات مصححة
                      </span>
                    )}
                  </div>
                  <span dir="ltr" className="font-mono text-slate-500 tabular-nums shrink-0">
                    {formatBytes(entry.sizeBytes)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
