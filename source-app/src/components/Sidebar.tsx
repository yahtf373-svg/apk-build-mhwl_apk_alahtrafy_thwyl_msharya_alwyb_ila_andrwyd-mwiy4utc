import React from 'react';
import { Cloud, FolderArchive, History, Layers, PackageOpen } from 'lucide-react';

export type ActiveTab = 'converter' | 'decompiler' | 'history' | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  historyCount: number;
  githubLogin: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  historyCount,
  githubLogin,
}) => {
  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
    meta?: string;
  }> = [
    {
      id: 'converter',
      label: 'تحويل مشروع إلى APK',
      icon: <FolderArchive className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'decompiler',
      label: 'مفكك ومستخرج APK',
      icon: <PackageOpen className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'history',
      label: 'سجل التطبيقات المصنوعة',
      icon: <History className="w-4 h-4 shrink-0" />,
      meta: String(historyCount),
    },
    {
      id: 'settings',
      label: 'الربط السحابي (GitHub)',
      icon: <Cloud className="w-4 h-4 shrink-0" />,
      meta: githubLogin ? `@${githubLogin}` : 'غير مربوط',
    },
  ];

  return (
    <aside className="w-full lg:w-72 shrink-0 bg-white border-b lg:border-b-0 lg:border-l border-slate-200 flex flex-col justify-between">
      <div className="p-5">
        <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
          <div className="w-9 h-9 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-base text-slate-900 truncate">
              مُحوّل APK الاحترافي
            </div>
            <div className="text-xs text-slate-500 truncate">
              Capacitor · Android Build
            </div>
          </div>
        </div>

        <nav aria-label="التنقل الرئيسي" className="mt-5 flex lg:flex-col gap-1.5 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`lg:w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 text-right focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 border border-teal-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </span>
                {item.meta !== undefined && (
                  <span
                    className={`text-xs tabular-nums shrink-0 ${
                      isActive ? 'text-teal-700 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {item.meta}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="hidden lg:block p-5 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
        <p className="font-medium text-slate-700 mb-1">محرك التغليف السحابي</p>
        <p>
          يُنشئ حزمة Capacitor 6 أصلية مع جسور MediaStore و FileProvider و WebChromeClient ويوقّع APK عبر GitHub Actions.
        </p>
      </div>
    </aside>
  );
};
