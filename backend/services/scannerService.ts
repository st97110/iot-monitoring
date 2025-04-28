import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/config';
import { parseCSVFile } from '../utils/csvParser';
import { updateLatestDataCache } from './dataService';
import { logger } from '../utils/logger';

/**
 * 掃描所有設備的最新數據
 */
export async function scanLatestData(): Promise<void> {
  try {
    logger.info('開始掃描設備數據...');

    const exists = await fs.pathExists(config.dataDir);
    if (!exists) {
      logger.error(`數據目錄 ${config.dataDir} 不存在`);
      return;
    }

    const entries = await fs.readdir(config.dataDir, { withFileTypes: true });
    const deviceDirs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const signalLogPath = path.join(config.dataDir, entry.name, 'signal_log');
        if (await fs.pathExists(signalLogPath)) {
          deviceDirs.push(entry.name);
        }
      }
    }

    logger.info(`找到 ${deviceDirs.length} 個設備`);

    for (const deviceId of deviceDirs) {
      try {
        await scanDeviceLatestData(deviceId);
      } catch (error: any) {
        logger.error(`掃描設備 ${deviceId} 錯誤: ${error.message}`);
      }
    }

    logger.info('設備數據掃描完成');
  } catch (error: any) {
    logger.error(`掃描數據錯誤: ${error.message}`);
  }
}

/**
 * 掃描特定設備的最新數據
 * @param deviceId 設備ID
 */
export async function scanDeviceLatestData(deviceId: string): Promise<void> {
  try {
    const signalLogPath = path.join(config.dataDir, deviceId, 'signal_log');
    if (!await fs.pathExists(signalLogPath)) {
      logger.warn(`設備 ${deviceId} 沒有信號日誌目錄`);
      return;
    }

    const dateDirs = await fs.readdir(signalLogPath);
    if (dateDirs.length === 0) {
      logger.warn(`設備 ${deviceId} 沒有任何數據日期目錄`);
      return;
    }

    dateDirs.sort((a, b) => b.localeCompare(a));
    const latestDateDir = path.join(signalLogPath, dateDirs[0]);

    const files = await fs.readdir(latestDateDir);
    if (files.length === 0) {
      logger.warn(`設備 ${deviceId} 最新日期 ${dateDirs[0]} 沒有任何數據文件`);
      return;
    }

    files.sort((a, b) => b.localeCompare(a));
    const latestFile = path.join(latestDateDir, files[0]);

    const data = await parseCSVFile(latestFile);

    if (data.length > 0) {
      await updateLatestDataCache(deviceId, data[0]);
      logger.info(`設備 ${deviceId} 最新數據已更新, 時間戳: ${data[0].timestamp}`);
    } else {
      logger.warn(`設備 ${deviceId} 最新數據文件為空`);
    }
  } catch (error: any) {
    logger.error(`掃描設備 ${deviceId} 最新數據錯誤: ${error.message}`);
    throw error;
  }
}
