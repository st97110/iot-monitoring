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
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <div className="text-slate-500 text-sm mt-1">{subtitle}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
