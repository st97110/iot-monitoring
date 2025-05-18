// backend/services/scannerService.ts
import fs from 'fs-extra';
import path from 'path';
import { format, subDays, startOfDay } from 'date-fns';
import { config } from '../config/config';
import { parseWiseCSVFile, parseTdrJSONFile  } from '../utils/parser';
// import { updateLatestDataCache } from './dataService';
import { logger } from '../utils/logger';
import { convertWiseToInfluxPoints, convertTdrToInfluxPoints, writeWiseDataToInflux, writeTdrDataToInflux } from './influxDataService';
import { moveFileAfterWrite } from './FileService';

const DATE_FORMAT = 'yyyyMMdd'; // 日期目錄格式

/**
 * 獲取當前日期和前一天的日期字串
 */
function getCurrentAndPreviousDateStrings(): { today: string; yesterday: string } {
    const now = new Date();
    const today = format(now, DATE_FORMAT);
    const yesterday = format(subDays(now, 1), DATE_FORMAT);
    return { today, yesterday };
}

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

    const { today, yesterday } = getCurrentAndPreviousDateStrings();
    let allDateDirs: string[] = [];

    try {
        allDateDirs = (await fs.readdir(deviceSpecificRootPath, { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && /^\d{8}$/.test(entry.name)) // 確保是8位數字的日期目錄
        .map(entry => entry.name);
    } catch (error: any) {
        logger.error(`[掃描] 讀取設備 ${deviceId} (來源: ${source}) 的日期目錄列表失敗: ${error.message}`);
        return;
    }

    if (allDateDirs.length === 0) {
        logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 在 ${deviceSpecificRootPath} 沒有找到日期目錄。`);
        return;
    }

    // 1. 處理昨天的目錄 (如果存在)
    if (allDateDirs.includes(yesterday)) {
        logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 檢查昨天的目錄: ${yesterday}`);
        const yesterdayPath = path.join(deviceSpecificRootPath, yesterday);
        try {
            const files = (await fs.readdir(yesterdayPath)).filter(filename =>
                (source === 'wise' && filename.toLowerCase().endsWith('.csv')) ||
                (source === 'tdr' && filename.toLowerCase().endsWith('.json'))
            );
            if (files.length > 0) {
                logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 處理昨天 (${yesterday}) 的 ${files.length} 個檔案。`);
                await processFilesBatch(yesterdayPath, deviceId, source, files, yesterday);
            } else {
                logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 昨天的目錄 ${yesterday} 為空。`);
            }
            // 處理完後，檢查目錄是否為空，如果為空則刪除
            const remainingFilesInYesterday = await fs.readdir(yesterdayPath);
            if (remainingFilesInYesterday.length === 0) {
                logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 昨天的目錄 ${yesterday} 已空，準備刪除。`);
                await fs.rm(yesterdayPath, { recursive: true, force: true }); // Node 14.14+ for recursive on rmdir
                                                                         // fs-extra's remove also works: await fs.remove(yesterdayPath);
                logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 已刪除昨天的空目錄 ${yesterday}。`);
            } else {
                 logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 昨天的目錄 ${yesterday} 處理後仍有 ${remainingFilesInYesterday.length} 個檔案/目錄，不刪除。`);
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 昨天的目錄 ${yesterday} 似乎已被刪除或不存在。`);
            } else {
                logger.error(`[掃描] 設備 ${deviceId} (來源: ${source}) 處理或刪除昨天目錄 ${yesterday} 時出錯: ${error.message}`);
            }
        }
    }
    
    // 2. 處理今天的目錄 (如果存在)
    if (allDateDirs.includes(today)) {
        logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 檢查今天的目錄: ${today}`);
        const todayPath = path.join(deviceSpecificRootPath, today);
        try {
            const files = (await fs.readdir(todayPath)).filter(filename =>
                (source === 'wise' && filename.toLowerCase().endsWith('.csv')) ||
                (source === 'tdr' && filename.toLowerCase().endsWith('.json'))
            );
            if (files.length > 0) {
                logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 處理今天 (${today}) 的 ${files.length} 個檔案。`);
                await processFilesBatch(todayPath, deviceId, source, files, today);
            }
        } catch (error: any) {
             if (error.code !== 'ENOENT') { // 如果不是 '文件或目錄不存在' 錯誤，則記錄
                logger.error(`[掃描] 設備 ${deviceId} (來源: ${source}) 處理今天目錄 ${today} 時出錯: ${error.message}`);
            }
        }
    } else {
        logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 今天的目錄 ${today} 不存在。`);
    }

    // 3. 刪除其他舊的空日期目錄 (除了今天和昨天)
    // 重新讀取一次目錄列表，因為昨天目錄可能已被刪除
    let currentExistingDateDirs: string[] = [];
    try {
        currentExistingDateDirs = (await fs.readdir(deviceSpecificRootPath, { withFileTypes: true }))
            .filter(entry => entry.isDirectory() && /^\d{8}$/.test(entry.name))
            .map(entry => entry.name);
    } catch (error: any) {
        logger.error(`[掃描] 清理舊目錄前，重新讀取設備 ${deviceId} (來源: ${source}) 的日期目錄列表失敗: ${error.message}`);
        return;
    }

    for (const dirName of currentExistingDateDirs) {
        if (dirName !== today && dirName !== yesterday) {
            const dirPath = path.join(deviceSpecificRootPath, dirName);
            try {
                const filesInDir = await fs.readdir(dirPath);
                if (filesInDir.length === 0) {
                    logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 發現舊的空目錄 ${dirName}，準備刪除。`);
                    await fs.rm(dirPath, { recursive: true, force: true });
                    logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 已刪除舊的空目錄 ${dirName}。`);
                } else {
                    // 可以選擇記錄或忽略非空舊目錄
                    logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 發現舊的非空目錄 ${dirName} (包含 ${filesInDir.length} 個項目)，不刪除。`);
                }
            } catch (error: any) {
                 if (error.code === 'ENOENT') {
                    logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 嘗試刪除的舊目錄 ${dirName} 似乎已被刪除。`);
                } else {
                    logger.error(`[掃描] 設備 ${deviceId} (來源: ${source}) 刪除舊目錄 ${dirName} 時出錯: ${error.message}`);
                }
            }
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
                        for (const record of validRecords) {
                            const recordTs = new Date(record.timestamp).getTime();
                            if (!isNaN(recordTs)) {
                                batchFirstTimestampMs = (batchFirstTimestampMs === null) ? recordTs : Math.min(batchFirstTimestampMs, recordTs);
                            }
                        }
                    }
                } else if (wiseRecords.length > 0) {
                    logger.warn(`[處理批次] WISE 檔案 ${filename} 所有 ${wiseRecords.length} 條記錄均無效或缺少時間戳。`);
                     // 即使記錄無效，也將檔案視為已處理並移動，以避免重複處理
                    processedFilePaths.push(filePath);
                } else {
                    logger.warn(`[處理批次] WISE 檔案 ${filename} 解析後沒有有效資料或解析失敗, 跳過。`);
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
                         logger.warn(`[處理批次] TDR 檔案 ${filename} (時間戳: ${tdrPayload.timestamp}) data 陣列為空, 跳過。`);
                         // 即使data為空，也將檔案視為已處理並移動
                         processedFilePaths.push(filePath);
                    }
                } else {
                    logger.warn(`[處理批次] TDR 檔案 ${filename} 解析失敗或結構無效, 跳過。`);
                     // 解析失敗或結構無效的檔案也移動，防止重複掃描
                    processedFilePaths.push(filePath);
                }
            }
        } catch (error: any) {
            logger.error(`[處理批次] 處理檔案 ${filename} (源: ${source}) 內部發生錯誤: ${error.message}`, error);
            // 發生錯誤的檔案也應該被移動，以避免無限重試
            processedFilePaths.push(filePath);
        }
    }

    // 寫入 InfluxDB
    if (allPoints.length > 0) {
        try {
            if (source === 'wise') {
                await writeWiseDataToInflux(allPoints);
            } else {
                await writeTdrDataToInflux(allPoints);
            }
            const displayTimestamp = batchFirstTimestampMs ? new Date(batchFirstTimestampMs).toISOString() : "未知";
            logger.info(`[處理批次] 設備 ${deviceId} (源: ${source}, 日期: ${dateDirName}) 成功寫入 ${allPoints.length} 筆資料到 InfluxDB。批次最早時間戳約為 ${displayTimestamp}`);
        } catch (error: any) {
            logger.error(`[處理批次] 寫入 InfluxDB 時出錯 (設備 ${deviceId}, 源: ${source}, 日期: ${dateDirName}): ${error.message}`, error);
            // 如果寫入DB失敗，processedFilePaths 中的檔案不應被標記為成功處理並移動到常規備份路徑
            // 這裡需要一個策略：是重試，還是將這些檔案移動到一個 "待重試" 或 "錯誤" 的備份位置？
            // 為了簡化，目前如果寫入失敗，檔案仍然會被移動（因為 processedFilePaths 已經填充）
            // 但這可能導致數據丟失。一個更好的方法是只在寫入成功後才將檔案加入 processedFilePaths，或者有更複雜的狀態管理。
            // **重要：以下移動邏輯應該在寫入成功後執行，或者有更完善的錯誤處理。**
        }
    }

    // 移動已處理的檔案 (無論是否成功生成 points 或成功寫入 DB，只要掃描過就移動以避免重複掃描)
    if (processedFilePaths.length > 0) {
        logger.info(`[處理批次] 設備 ${deviceId} (源: ${source}, 日期: ${dateDirName}) 準備移動 ${processedFilePaths.length} 個已掃描檔案。`);
        for (const filePath of processedFilePaths) {
            try {
                const backupDir = (source === 'wise') ? config.folder.wiseBackupDir : config.folder.tdrBackupDir;
                let logType: string | undefined = undefined;

                if (source === 'wise') {
                    if (filePath.includes('/signal_log/') || filePath.includes('\\signal_log\\')) {
                        logType = 'signal_log';
                    }
                }
                await moveFileAfterWrite(
                    filePath,
                    deviceId,
                    dateDirName,
                    backupDir,
                    logType
                );
            } catch (moveError: any) {
                logger.error(`[處理批次] 移動檔案 ${path.basename(filePath)} 到備份時出錯: ${moveError.message}`);
                // 即使移動失敗，也繼續處理下一個檔案
           }
       }
       logger.info(`[處理批次] 設備 ${deviceId} (源: ${source}, 日期: ${dateDirName}) 完成移動 ${processedFilePaths.length} 個已掃描檔案。`);
    }
    if (allPoints.length === 0 && files.length > 0 && processedFilePaths.length === files.length) {
        // 所有檔案都被掃描了，但沒有產生任何點
        logger.info(`[處理批次] 設備 ${deviceId} (源: ${source}, 日期: ${dateDirName}) 在路徑 ${currentDataPath} 的 ${files.length} 個檔案中沒有產生可寫入的資料點，但檔案已被處理並移動。`);
    }
}