import { Router, Request, Response, NextFunction } from 'express';
import { getDevices } from '../controllers/deviceController';

const router = Router();

/**
 * @route GET /api/devices
 * @desc 獲取所有可用的設備列表
 */
router.get('/devices', getDevices);

export default router;