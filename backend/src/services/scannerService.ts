// backend/services/scannerService.ts
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/config';
import { parseCSVFile } from '../utils/csvParser';
import { updateLatestDataCache } from './dataService';
import { logger } from '../utils/logger';
import { convertWiseToInfluxPoints, convertTdrToInfluxPoints, writeWiseDataToInflux, writeTdrDataToInflux } from './influxDataService';
import { moveCsvAfterWrite } from './FileService';

/**
 * 掃描所有設備的所有未處理資料
 */
export async function scanLatestData(): Promise<void> {
    try {
        logger.info('[掃描] 開始掃描 WISE 資料夾...');
        await scanFolder(config.folder.wiseDataDir, 'wise');

        logger.info('[掃描] 開始掃描 TDR 資料夾...');
        await scanFolder(config.folder.tdrDataDir, 'tdr');

        logger.info('[掃描] 所有設備資料掃描完成');
    } catch (error: any) {
        logger.error(`[掃描] 掃描數據錯誤: ${error.message}`);
    }
}

/**
 * 掃描指定資料夾下所有設備
 * @param basePath 根目錄
 * @param source 資料來源 wise / tdr
 */
async function scanFolder(basePath: string, source: 'wise' | 'tdr'): Promise<void> {
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
        await scanDeviceAllData(basePath, deviceId, source);
        } catch (error: any) {
        logger.error(`[掃描] 設備 ${deviceId} 掃描錯誤: ${error.message}`);
        }
    }
}

/**
 * 掃描特定設備，處理所有還沒搬走的資料
 * @param basePath 根目錄
 * @param deviceId 裝置ID
 * @param source 資料來源 wise / tdr
 */
async function scanDeviceAllData(basePath: string, deviceId: string, source: 'wise' | 'tdr'): Promise<void> {
    const dataPath = (source === 'wise')
        ? path.join(basePath, deviceId, 'signal_log')
        : path.join(basePath, deviceId);
        
    let firstTimestamp = Date.now();
        
        if (!await fs.pathExists(dataPath)) {
        logger.warn(`[掃描] 設備 ${deviceId} 找不到資料夾: ${dataPath}`);
        return;
        }
    
        const dateDirs = await fs.readdir(dataPath);
        if (dateDirs.length === 0) {
            logger.warn(`[掃描] 設備 ${deviceId} 沒有任何日期目錄`);
            return;
        }

    dateDirs.sort((a, b) => a.localeCompare(b)); // 日期升冪排序（舊的先處理）
    
    for (const dateDirName of dateDirs) {
        const dateDirPath = path.join(dataPath, dateDirName);

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
                let records: any[] = [];
                if (source === 'wise') {
                    records = await parseCSVFile(filePath);
                }
        
                if (records.length > 0) {
                    const points = (source === 'wise')
                    ? convertWiseToInfluxPoints(deviceId, records)
                    : convertTdrToInfluxPoints(deviceId, records);

                    allPoints.push(...points);
                    processedFiles.push(filePath);
                    firstTimestamp = Math.min(firstTimestamp, records[0].timestamp);
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
            if (source === 'wise') {
            await writeWiseDataToInflux(allPoints);
            } else {
            await writeTdrDataToInflux(allPoints);
            }

            logger.info(`[掃描] 設備 ${deviceId} 寫入 ${allPoints.length} 筆資料到 InfluxDB，時間戳為 ${firstTimestamp}`);

            for (const filePath of processedFiles) {
                const backupDir = (source === 'wise') ? config.folder.wiseBackupDir : config.folder.tdrBackupDir;
                // 🔥 根據 filePath 自動判斷 logType
                let logType: string | undefined = undefined;
                if (source === 'wise') {
                    if (filePath.includes('/signal_log/') || filePath.includes('\\signal_log\\')) {
                    logType = 'signal_log';
                    } else if (filePath.includes('/system_log/') || filePath.includes('\\system_log\\')) {
                    logType = 'system_log';
                    }
                }
            
                await moveCsvAfterWrite(
                    filePath,
                    deviceId,
                    dateDirName,
                    backupDir,
                    logType
                );
            }

                logger.info(`[掃描] 設備 ${deviceId} 搬移 ${processedFiles.length} 個檔案至備份資料夾`);
        } catch (error: any) {
                logger.error(`[掃描] 寫入 InfluxDB 錯誤: ${error.message}`);
        }
        } else {
            logger.info(`[掃描] 設備 ${deviceId} 日期 ${dateDirName} 沒有需要寫入的資料`);
        }
    }
}