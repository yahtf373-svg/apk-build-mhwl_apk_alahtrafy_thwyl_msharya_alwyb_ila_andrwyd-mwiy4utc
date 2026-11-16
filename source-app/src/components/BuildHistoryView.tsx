import React, { useMemo, useState } from 'react';
import {
  Download,
  Edit3,
  ExternalLink,
  FolderArchive,
  Search,
  Trash2,
} from 'lucide-react';
import type { BuildRecord } from '../types/apk';

interface BuildHistoryViewProps {
  builds: BuildRecord[];
  isLoading: boolean;
  onEditBuild: (record: BuildRecord) => void;
  onDownloadApk: (record: BuildRecord) => void;
  onDeleteBuild: (id: string) => void;
  onGoToConverter: () => void;
}

type FilterState = 'all' | 'completed' | 'draft';

export const BuildHistoryView: React.FC<BuildHistoryViewProps> = ({
  builds,
  isLoading,
  onEditBuild,
  onDownloadApk,
  onDeleteBuild,
  onGoToConverter,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterState>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return builds.filter((b) => {
      if (filter === 'completed' && b.status !== 'completed') return false;
      if (filter === 'draft' && b.status === 'completed') return false;
      if (!q) return true;
      return (
        b.appName.toLowerCase().includes(q) ||
        b.packageName.toLowerCase().includes(q) ||
        b.sourceZipName.toLowerCase().includes(q)
      );
    });
  }, [builds, query, filter]);

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const statusText = (status: BuildRecord['status']) => {
    switch (status) {
      case 'completed':
        return { label: 'APK جاهز للتحميل', cls: 'text-emerald-700' };
      case 'in_progress':
      case 'queued':
        return { label: 'قيد البناء السحابي', cls: 'text-amber-700' };
      case 'failed':
        return { label: 'تعثر البناء', cls: 'text-red-700' };
      default:
        return { label: 'حزمة محفوظة', cls: 'text-slate-600' };
    }
  };

  const activePermissionNames = (b: BuildRecord) => {
    const list: string[] = [];
    if (b.permissions.gallerySave) list.push('حفظ المعرض');
    if (b.permissions.nativeShare) list.push('المشاركة الأصلية');
    if (b.permissions.microphone) list.push('الميكروفون');
    if (b.permissions.fullscreen) list.push('ملء الشاشة');
    return list.length > 0 ? list.join(' · ') : 'صلاحيات أساسية فقط';
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم التطبيق أو Package Name..."
            aria-label="البحث في سجل التطبيقات"
            className="w-full rounded-lg border border-slate-300 bg-white pr-10 pl-3.5 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
          />
        </div>

        <div
          role="group"
          aria-label="تصفية التطبيقات حسب الحالة"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
        >
          {(
            [
              { id: 'all', label: 'الكل' },
              { id: 'completed', label: 'APK جاهز' },
              { id: 'draft', label: 'محفوظة للتعديل' },
            ] as Array<{ id: FilterState; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {[1, 2, 3].map((row) => (
            <div key={row} className="p-5 flex items-center justify-between gap-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-slate-200 rounded" />
                  <div className="h-3 w-64 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="h-8 w-24 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
            <FolderArchive className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {builds.length === 0
              ? 'سجل التطبيقات المصنوعة فارغ حالياً'
              : 'لا توجد نتائج مطابقة لبحثك'}
          </h3>
          <p className="text-sm text-slate-500 mt-1 mb-5 max-w-md mx-auto">
            {builds.length === 0
              ? 'عند تحويل أي مشروع ويب أو تصدير حزمة Capacitor، سيُحفظ تلقائياً هنا لتتمكن من تعديله أو إعادة تحميله.'
              : 'جرّب تغيير كلمات البحث أو إزالة فلتر الحالة لعرض كل التطبيقات.'}
          </p>
          <button
            type="button"
            onClick={onGoToConverter}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors"
          >
            تحويل مشروع جديد
          </button>
        </div>
      ) : (
        <div
          data-testid="builds-history-list"
          className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100"
        >
          {filtered.map((item) => {
            const st = statusText(item.status);
            return (
              <div
                key={item.id}
                className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-teal-700 text-white flex items-center justify-center font-display font-bold text-lg">
                    {item.iconDataUrl ? (
                      <img
                        src={item.iconDataUrl}
                        alt={`أيقونة ${item.appName}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (item.appName.trim()[0] || 'أ').toUpperCase()
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 truncate">
                        {item.appName}
                      </h3>
                      <span className="text-slate-300">·</span>
                      <span className={`text-xs font-semibold ${st.cls}`}>{st.label}</span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span dir="ltr" className="font-mono text-slate-700">
                        {item.packageName}
                      </span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">v{item.versionName}</span>
                      <span>·</span>
                      <span className="tabular-nums">{item.fileCount} ملفاً</span>
                      <span>·</span>
                      <span>{formatDate(item.updatedAt)}</span>
                    </div>

                    <div className="mt-1.5 text-xs text-slate-500">
                      {activePermissionNames(item)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {item.status === 'completed' && (item.releaseAssetId || item.artifactId) && item.repoFullName && (
                    <button
                      type="button"
                      onClick={() => onDownloadApk(item)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تحميل APK</span>
                    </button>
                  )}

                  {item.workflowRunUrl && (
                    <a
                      href={item.workflowRunUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>GitHub</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => onEditBuild(item)}
                    aria-label={`تعديل ${item.appName}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-teal-700" />
                    <span>تعديل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteBuild(item.id)}
                    aria-label={`حذف ${item.appName}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-500 hover:text-red-700 text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
