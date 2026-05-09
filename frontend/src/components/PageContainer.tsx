import { ReactNode } from 'react';

/**
 * 統一的頁面容器：max-w-screen-2xl + 統一 padding + space-y。
 * 所有 main 頁面包這個，切換頁時內容寬度不會跳動。
 */
export default function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 py-3 space-y-3">
      {children}
    </div>
  );
}
