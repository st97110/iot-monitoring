// backend/app.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import deviceRoutes from './routes/deviceRoutes';
import dataRoutes from './routes/dataRoutes';
import tdrRoutes from './routes/tdrRoutes';
import wiseUploadRoutes from './routes/wiseUploadRoutes';
import { logger } from './utils/logger';

const app: Application = express();

// --- Middleware ---
app.use(helmet());                    // 安全 headers
app.use(cors());                      // 允許跨域
app.use(express.json());              // 解析 application/json
app.use(express.text());              // 解析 text/plain

// 特別處理 WISE 上傳的 /upload_log ，接收 raw binary
app.use('/upload_log', express.raw({ type: '*/*', limit: '10mb' }), wiseUploadRoutes);

app.use(morgan('dev'));               // HTTP 請求日誌

// --- Routes ---
app.use('/api', deviceRoutes);
app.use('/api', dataRoutes);
app.use('/api/tdr', tdrRoutes);
app.use('/upload_log', wiseUploadRoutes);

// 健康檢查
app.get('/', (req: Request, res: Response) => {
  res.json({ message: '儀器監測數據 API 服務運行中' });
});

// --- 404 Not Found ---
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: '找不到請求的資源' });
});

// --- 錯誤處理 Middleware ---
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(`錯誤: ${err.message}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? '伺服器錯誤' : err.message
  });
});

export { app };
