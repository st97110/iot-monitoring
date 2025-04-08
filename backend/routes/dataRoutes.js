const express = require('express');
const dataController = require('../controllers/dataController');
const router = express.Router();

/**
 * @route GET /api/latest
 * @desc 獲取所有設備的最新數據，或者通過查詢參數獲取特定設備最新數據
 * @query {string} deviceId - 可選，指定設備ID
 */
router.get('/latest', dataController.getLatestData);

/**
 * @route GET /api/history
 * @desc 獲取特定設備在指定日期範圍內的歷史數據
 * @query {string} deviceId - 必須，指定設備ID
 * @query {string} startDate - 必須，開始日期 (YYYY-MM-DD)
 * @query {string} endDate - 必須，結束日期 (YYYY-MM-DD)
 */
router.get('/history', dataController.getHistoryData);

module.exports = router;
