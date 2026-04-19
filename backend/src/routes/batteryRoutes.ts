import { Router } from 'express';
import { serveBatteryPage, getBatteryLatestJson, getBatteryHistoryJson } from '../controllers/batteryController';

const router = Router();

// 頁面（HTML）
router.get('/', serveBatteryPage);
// 最新值（JSON）
router.get('/latest', getBatteryLatestJson);
// 24 小時歷史（JSON，給走勢圖用）
router.get('/history', getBatteryHistoryJson);

export default router;
