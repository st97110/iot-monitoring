/**
 * 將 4–20 mA 轉成水深（m）
 * @param {number} current   量測到的電流 (mA)
 * @param {number} wellDepth 量程深度 (m)，必填
 * @param {number} minCurrent 量程下限 (mA)，預設 4
 * @param {number} maxCurrent 量程上限 (mA)，預設 20
 * @returns {number} 轉換後的水深 (m)
 */
export function mAtoDepth(current, wellDepth, minCurrent = 4, maxCurrent = 20) {
    // 夾到合法範圍
    const clamped = Math.min(Math.max(current, minCurrent), maxCurrent);
    // 計算比例
    const ratio = (clamped - minCurrent) / (maxCurrent - minCurrent);
    // 回傳深度
    return ratio * wellDepth;
}