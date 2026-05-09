/**
 * Home / History 載入時用的骨架卡片，跟 DeviceCard 形狀一致
 * 為什麼自寫不用 lib：簡單到不值得多裝套件，且樣式可控
 */
export default function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex">
        <div className="w-24 h-24 bg-slate-200 animate-pulse" />
        <div className="flex-1 p-4 space-y-2">
          <div className="h-4 bg-slate-200 animate-pulse rounded w-2/3" />
          <div className="h-3 bg-slate-100 animate-pulse rounded w-1/3" />
          <div className="h-6 bg-slate-200 animate-pulse rounded w-1/2 mt-3" />
        </div>
      </div>
    </div>
  );
}

/** 表格用的列骨架 */
export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-slate-200 animate-pulse rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

/** 通用塊狀骨架（圖表載入用） */
export function SkeletonBlock({ height = 320 }: { height?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="bg-slate-100 animate-pulse rounded" style={{ height }} />
    </div>
  );
}
