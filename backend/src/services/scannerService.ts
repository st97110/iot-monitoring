// backend/services/scannerService.ts
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/config';
import { parseWiseCSVFile, parseTdrJSONFile  } from '../utils/parser';
// import { updateLatestDataCache } from './dataService';
import { logger } from '../utils/logger';
import { convertWiseToInfluxPoints, convertTdrToInfluxPoints, writeWiseDataToInflux, writeTdrDataToInflux } from './influxDataService';
import { moveFileAfterWrite } from './FileService';

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
 * 掃描特定設備的資料。
 * WISE 資料結構: <basePath>/<deviceId>/signal_log/<dateDirName>/<file.csv>
 * TDR 資料結構: <basePath>/<deviceId>/<dataDirName>/<file.json>
 *
 * @param rootPathForSource 來源的根目錄 (e.g., config.folder.wiseDataDir or config.folder.tdrDataDir)
 * @param deviceId 裝置ID
 * @param source 資料來源 'wise' 或 'tdr'
 */
async function scanDeviceAllData(rootPathForSource: string, deviceId: string, source: 'wise' | 'tdr'): Promise<void> {
    // WISE 特有的子目錄是 'signal_log'
    // TDR 檔案直接在 <deviceId>/<dateDirName> 下 (相對於 tdrDataDir)
    const deviceSpecificRootPath = (source === 'wise')
        ? path.join(rootPathForSource, deviceId, 'signal_log')
        : path.join(rootPathForSource, deviceId);

    if (!await fs.pathExists(deviceSpecificRootPath)) {
        logger.warn(`[掃描] 設備 ${deviceId} (來源: ${source}) 找不到特定資料路徑: ${deviceSpecificRootPath}`);
        return;
    }

    const dateDirEntries = await fs.readdir(deviceSpecificRootPath, { withFileTypes: true });
    const dateDirs = dateDirEntries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

    if (dateDirs.length === 0) {
        logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 在 ${deviceSpecificRootPath} 沒有找到日期目錄。`);
        return;
    }

    dateDirs.sort((a, b) => a.localeCompare(b)); // 日期升冪排序（舊的先處理）
    
    for (const dateDirName of dateDirs) {
        const currentDataPath = path.join(deviceSpecificRootPath, dateDirName); // 這是包含資料檔案的目錄

        const files = (await fs.readdir(currentDataPath)).filter(filename =>
            (source === 'wise' && filename.toLowerCase().endsWith('.csv')) ||
            (source === 'tdr' && filename.toLowerCase().endsWith('.json'))
        );

        if (files.length > 0) {
            await processFilesBatch(currentDataPath, deviceId, source, files, dateDirName);
        } else {
            logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 在日期目錄 ${dateDirName} (${currentDataPath}) 沒有找到對應的資料檔案。`);
        }
    }
}

async function processFilesBatch(
    currentDataPath: string,
    deviceId: string,
    source: 'wise' | 'tdr',
    files: string[],
    dateDirName: string // 現在對於 WISE 和 TDR 都是日期目錄名
) {
    const allPoints: any[] = [];
    const processedFilePaths: string[] = [];
    let batchFirstTimestampMs: number | null = null;

    files.sort((a, b) => a.localeCompare(b));

    for (const filename of files) {
        const filePath = path.join(currentDataPath, filename);
        try {
            if (source === 'wise') {
                const wiseRecords = await parseWiseCSVFile(filePath);
                const validRecords = wiseRecords.filter(r => !r.hasOwnProperty('error') && r.timestamp);

                if (validRecords.length > 0) {
                    const wisePoints = convertWiseToInfluxPoints(deviceId, validRecords);
                    if (wisePoints.length > 0) {
                        allPoints.push(...wisePoints);
                        processedFilePaths.push(filePath);
                        for (const record of validRecords) { // 從有效記錄中獲取時間戳
                            const recordTs = new Date(record.timestamp).getTime();
                            if (!isNaN(recordTs)) {
                                batchFirstTimestampMs = (batchFirstTimestampMs === null) ? recordTs : Math.min(batchFirstTimestampMs, recordTs);
                            }
                        }
                    }
                } else if (wiseRecords.length > 0) {
                    logger.warn(`[掃描] WISE 檔案 ${filename} 所有 ${wiseRecords.length} 條記錄均無效或缺少時間戳。`);
                } else {
                    logger.warn(`[掃描] WISE 檔案 ${filename} 解析後沒有有效資料或解析失敗, 跳過。`);
                }

            } else if (source === 'tdr') {
                const tdrPayloadArray = await parseTdrJSONFile(filePath);

                if (tdrPayloadArray.length > 0) {
                    const tdrPayload = tdrPayloadArray[0];
                    if (tdrPayload.data && tdrPayload.data.length > 0) {
                        const tdrPoints = convertTdrToInfluxPoints(deviceId, tdrPayload);
                        if (tdrPoints.length > 0) {
                            allPoints.push(...tdrPoints);
                            processedFilePaths.push(filePath);
                            const payloadTs = new Date(tdrPayload.timestamp).getTime();
                            if (!isNaN(payloadTs)) {
                                batchFirstTimestampMs = (batchFirstTimestampMs === null) ? payloadTs : Math.min(batchFirstTimestampMs, payloadTs);
                            }
                        }
                    } else {
                         logger.warn(`[掃描] TDR 檔案 ${filename} (時間戳: ${tdrPayload.timestamp}) data 陣列為空, 跳過。`);
                    }
                } else {
                    logger.warn(`[掃描] TDR 檔案 ${filename} 解析失敗或結構無效, 跳過。`);
                }
            }
        } catch (error: any) {
            logger.error(`[掃描] 處理檔案 ${filename} (源: ${source}) 內部發生錯誤: ${error.message}`, error);
        }
    }

    if (allPoints.length > 0) {
        try {
            if (source === 'wise') {
                await writeWiseDataToInflux(allPoints);
            } else {
                await writeTdrDataToInflux(allPoints);
            }

            const displayTimestamp = batchFirstTimestampMs ? new Date(batchFirstTimestampMs).toISOString() : "未知";
            logger.info(`[掃描] 設備 ${deviceId} (源: ${source}, 日期: ${dateDirName}) 成功寫入 ${allPoints.length} 筆資料到 InfluxDB。批次最早時間戳約為 ${displayTimestamp}`);

            for (const filePath of processedFilePaths) {
                const backupDir = (source === 'wise') ? config.folder.wiseBackupDir : config.folder.tdrBackupDir;
                let logType: string | undefined = undefined; // WISE 特有

                if (source === 'wise') {
                    if (filePath.includes('/signal_log/') || filePath.includes('\\signal_log\\')) {
                        logType = 'signal_log';
                    }
                }
                // 對於 TDR，logType 為 undefined，dateDirName 已經是正確的日期目錄名
                await moveFileAfterWrite( // 考慮重命名
                    filePath,
                    deviceId,
                    dateDirName, // 現在 dateDirName 對於 TDR 也是日期目錄
                    backupDir,
                    logType
                );
            }
            logger.info(`[掃描] 設備 ${deviceId} (源: ${source}, 日期: ${dateDirName}) 成功搬移 ${processedFilePaths.length} 個檔案至備份資料夾。`);
        } catch (error: any) {
            logger.error(`[掃描] 寫入 InfluxDB 或搬移檔案時出錯 (設備 ${deviceId}, 源: ${source}, 日期: ${dateDirName}): ${error.message}`, error);
        }
    } else if (files.length > 0) {
        logger.info(`[掃描] 設備 ${deviceId} (源: ${source}, 日期: ${dateDirName}) 在路徑 ${currentDataPath} 的 ${files.length} 個檔案中沒有產生可寫入的資料點。`);
    }
}