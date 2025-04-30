import { Router } from 'express';
import { getDevices } from '../controllers/deviceController';

const router = Router();

/**
 * @route GET /api/devices
 * @desc 獲取所有可用的設備列表，支援 fallback
 * @query {string} source - 資料來源，可為 'wise'、'tdr' 或 'both'（預設為 both）
 * @returns {DeviceInfo[]} 裝置列表
 */
router.get('/devices', getDevices);

export default router;