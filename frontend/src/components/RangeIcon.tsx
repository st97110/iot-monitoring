// 「最近 X 天」快速範圍按鈕用的 inline SVG icon
// 對應 public/images/range/{1d,1w,1m}.svg，但 inline 能吃 currentColor
// 隨父層 text-slate-700 / text-blue-600 等動態變色

interface Props {
  days: 1 | 7 | 30;
  className?: string;
}

export default function RangeIcon({ days, className = 'w-5 h-5' }: Props) {
  // 共用 calendar 外框
  const frame = (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
      <line x1="3" y1="9" x2="21" y2="9" />
    </>
  );

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {frame}
      {days === 1 && (
        <text
          x="12" y="18.2" textAnchor="middle"
          fontFamily="system-ui, sans-serif" fontWeight={800} fontSize="8.5"
          stroke="none" fill="currentColor"
        >1</text>
      )}
      {days === 7 && (
        <>
          <rect x="4.5" y="13" width="15" height="3.5" rx="0.6"
                fill="currentColor" stroke="none" opacity={0.85}/>
          {/* 7 格分隔白線 */}
          {[6.6, 8.7, 10.8, 12.9, 15.0, 17.1].map(x => (
            <line key={x} x1={x} y1="13" x2={x} y2="16.5" stroke="white" strokeWidth={0.5}/>
          ))}
        </>
      )}
      {days === 30 && (
        <g fill="currentColor" stroke="none" opacity={0.85}>
          {[11.5, 14, 16.5, 19].flatMap((cy, rowIdx) => {
            const cols = [5.5, 7.85, 10.2, 12.0, 13.8, 16.15, 18.5];
            // 第 4 列只有 5 個（代表月底）
            const visible = rowIdx === 3 ? cols.slice(0, 5) : cols;
            return visible.map(cx => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={0.7}/>);
          })}
        </g>
      )}
    </svg>
  );
}
