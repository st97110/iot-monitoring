import { Router } from 'express';
import { uploadWiseLog } from '../controllers/wiseUploadController';

const router = Router();

// 注意：在 app.ts 已經掛上 express.raw()，這裡就直接 handler
router.post('/:macAddress/:logType/:date/:filename', uploadWiseLog);

export default router;