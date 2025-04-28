// backend/schedulers/dataScanScheduler.ts
import cron from 'node-cron';
import { scanLatestData } from '../services/scannerService';
import { config } from '../config/config';
import { logger } from '../utils/logger';

// 定時任務控制器
let scanTask: cron.ScheduledTask | undefined;

/**
 * 啟動排程任務
 */
export function start(): void {
  if (scanTask) {
    logger.info('[排程] 舊掃描任務已存在，停止');
    stop();
  }

  const cronExpression = getCronExpression(config.scanInterval);
  logger.info(`[排程] 啟動掃描任務，每 ${config.scanInterval} 秒掃描一次，cron 表達式: ${cronExpression}`);

  // 設定排程
  scanTask = cron.schedule(cronExpression, async () => {
    await safeScan();
  });

  // 一啟動就先掃一次
  safeScan().catch((error) => logger.error(`[排程] 初次掃描失敗: ${error.message}`));
}

/**
 * 停止排程任務
 */
export function stop(): void {
  if (scanTask) {
    scanTask.stop();
    scanTask = undefined;
    logger.info('[排程] 掃描任務已停止');
  }
}

/**
 * 轉換 scanInterval 秒數成 cron 表達式
 */
function getCronExpression(seconds: number): string {
  if (seconds < 60) {
    return `*/${seconds} * * * * *`; // 每 x 秒
  } else {
    const minutes = Math.floor(seconds / 60);
    return `0 */${minutes} * * * *`; // 每 x 分鐘
  }
}

/**
 * 包裝一層安全掃描
 */
async function safeScan(): Promise<void> {
  const startTime = Date.now();
  logger.info(`[排程] 開始掃描最新設備數據...`);
  
  try {
    await scanLatestData();
    const duration = Date.now() - startTime;
    logger.info(`[排程] 完成掃描，用時 ${duration} ms`);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(`[排程] 掃描失敗，用時 ${duration} ms, 錯誤: ${error.message}`);
  }
}
