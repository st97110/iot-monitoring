// routes/tdrRoutes.js
import { Router, Request, Response, NextFunction } from 'express';
import { uploadTdrData } from '../controllers/tdrController';

const router = Router();

// 直接 parse JSON，body: { device, timestamp, data: [...] }
router.post('/upload', uploadTdrData);

export default router;