import { Router } from 'express';
import { getLatestData, getHistoryData } from '../controllers/dataController';

const router = Router();

/**
 * @route GET /api/latest
 * @desc 獲取所有設備的最新數據，或者通過查詢參數獲取特定設備最新數據
 * @query source   (wise | tdr | both, optional; default=both)
 * @query {string} deviceId - 可選，指定設備ID
 * @returns {Record<string, any>} - 裝置對應的最新數據
 */
router.get('/latest', getLatestData);

/**
 * @route GET /api/history
 * @desc 獲取特定或全部設備在指定日期範圍內的歷史數據（支援 fallback）
 * @query {string} deviceId - 可選，指定設備ID；不給時查詢所有設備
 * @query {string} startDate - 必須，開始日期 (YYYY-MM-DD)
 * @query {string} endDate - 必須，結束日期 (YYYY-MM-DD)
 * @query {string} source - 可選，資料來源 'wise' 或 'tdr'，預設為 'both'
 * @returns {any[]} - 符合條件的歷史數據陣列
 */
router.get('/history', getHistoryData);

export default router;