// backend/services/scannerService.ts
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/config';
import { parseCSVFile } from '../utils/csvParser';
import { updateLatestDataCache } from './dataService';
import { logger } from '../utils/logger';
import { parseWiseCsv, convertToInfluxPoints, writeWiseDataToInflux } from './wiseInfluxService';
import { moveCsvAfterWrite } from './wiseFileService';

/**
 * 掃描所有設備的所有未處理資料
 */
export async function scanLatestData(): Promise<void> {
  try {
    logger.info('[掃描] 開始掃描 WISE 資料夾...');
    await scanFolder(config.folder.wiseDataDir);

    logger.info('[掃描] 開始掃描 TDR 資料夾...');
    await scanFolder(config.folder.tdrDataDir);

    logger.info('[掃描] 所有設備資料掃描完成');
  } catch (error: any) {
    logger.error(`[掃描] 掃描數據錯誤: ${error.message}`);
  }
}

/**
 * 掃描指定資料夾下所有設備
 */
async function scanFolder(basePath: string): Promise<void> {
  const exists = await fs.pathExists(basePath);
  if (!exists) {
    logger.warn(`[掃描] 資料夾不存在: ${basePath}`);
    return;
  }

  const entries = await fs.readdir(basePath, { withFileTypes: true });
  const deviceDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

  logger.info(`[掃描] 資料夾 ${basePath} 找到 ${deviceDirs.length} 個設備`);

  for (const deviceId of deviceDirs) {
    try {
      await scanDeviceAllData(basePath, deviceId);
    } catch (error: any) {
      logger.error(`[掃描] 設備 ${deviceId} 掃描錯誤: ${error.message}`);
    }
  }
}

/**
 * 掃描特定設備，處理所有還沒搬走的資料
 * @param deviceId 設備ID
 */
async function scanDeviceAllData(basePath: string, deviceId: string): Promise<void> {
    const signalLogPath = path.join(basePath, deviceId, 'signal_log');
    const deviceDir = path.join(basePath, deviceId);
    
    if (!await fs.pathExists(signalLogPath)) {
      logger.warn(`[掃描] 設備 ${deviceId} 沒有 signal_log 資料夾`);
      return;
    }

    const dateDirs = await fs.readdir(signalLogPath);
    if (dateDirs.length === 0) {
      logger.warn(`[掃描] 設備 ${deviceId} 沒有任何日期目錄`);
      return;
    }

    dateDirs.sort((a, b) => a.localeCompare(b)); // 日期升冪排序（舊的先處理）
    
    for (const dateDirName of dateDirs) {
      const dateDirPath = path.join(signalLogPath, dateDirName);

      if (!(await fs.pathExists(dateDirPath))) continue;

      const files = await fs.readdir(dateDirPath);
      if (files.length === 0) continue;

      const allPoints = [];
      const processedFiles: string[] = [];
      
      // 排序 csv，照時間處理
      files.sort((a, b) => a.localeCompare(b));
      
      for (const filename of files) {
        const filePath = path.join(dateDirPath, filename);

        // 檢查是不是 CSV，避免處理到亂七八糟的檔案
        if (!filename.endsWith('.csv')) continue;

        try {
          const records = await parseWiseCsv(filePath);

          if (records.length > 0) {
            const points = convertToInfluxPoints(deviceId, records);
            allPoints.push(...points);
            processedFiles.push(filePath);
          } else {
            logger.warn(`[掃描] 檔案 ${filename} 沒有有效資料, 跳過`);
          }
        } catch (error: any) {
          logger.error(`[掃描] 讀取檔案 ${filename} 錯誤: ${error.message}`);
        }
      }

    // 如果有資料，才寫入 InfluxDB
    if (allPoints.length > 0) {
      try {
        await writeWiseDataToInflux(allPoints);
        logger.info(`[掃描] 設備 ${deviceId} 寫入 ${allPoints.length} 筆資料到 InfluxDB, 時間戳: ${allPoints[0].timestamp}`);

        // 搬走所有成功處理的檔案
        for (const filePath of processedFiles) {
          await moveCsvAfterWrite(filePath, deviceDir);
        }

        logger.info(`[掃描] 設備 ${deviceId} 搬移 ${processedFiles.length} 個檔案至 write/`);
      } catch (error: any) {
        logger.error(`[掃描] 寫入 InfluxDB 錯誤: ${error.message}`);
      }
    } else {
      logger.info(`[掃描] 設備 ${deviceId} 日期 ${dateDirName} 沒有需要寫入的資料`);
    }
  }
}