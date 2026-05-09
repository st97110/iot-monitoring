import { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}

/**
 * 統一的頁面 header：左側 title + subtitle，右側可選 action（按鈕／統計列）
 * 所有頁面（Home / History / TrendPage / InteractiveMap）共用，視覺一致
 */
export default function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-tight">{title}</h1>
        {subtitle && <div className="text-slate-500 text-xs sm:text-sm mt-0.5">{subtitle}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
