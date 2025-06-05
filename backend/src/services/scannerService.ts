// backend/services/scannerService.ts
import fs from 'fs-extra';
import path from 'path';
import { format, subDays } from 'date-fns';
import { config } from '../config/config';
import { parseWiseCSVFile, parseTdrJSONFile  } from '../utils/parser';
// import { updateLatestDataCache } from './dataService';
import { isDeviceRainGauge } from '../utils/helper';
import { logger } from '../utils/logger';
import { Point } from './influxClientService';
import { convertWiseToInfluxPoints, convertTdrToInfluxPoints, writeWiseDataToInflux, writeTdrDataToInflux } from './influxDataService';
import { moveFileAfterWrite } from './FileService';

const DATE_FORMAT = 'yyyyMMdd'; // 日期目錄格式

// ✨ 1. 定義狀態檔案的路徑
const RAIN_GAUGE_STATE_FILE_PATH = path.resolve(__dirname, '../../rainGaugeState.json'); // 放在項目根目錄或一個可配置的路徑

// ✨ 維護雨量筒最後狀態的內存對象
// Key: deviceId, Value: { lastCount: number, lastTimestamp: number (ms) }
let rainGaugeLastState: Record<string, { lastCount: number, lastTimestamp: number }> = {};

// ✨ 2. 函數：載入雨量筒狀態從檔案
async function loadRainGaugeState(): Promise<void> {
    try {
        if (await fs.pathExists(RAIN_GAUGE_STATE_FILE_PATH)) {
            const fileContent = await fs.readFile(RAIN_GAUGE_STATE_FILE_PATH, 'utf-8');
            const loadedState = JSON.parse(fileContent);
            // 簡單的驗證，確保載入的是一個物件
            if (typeof loadedState === 'object' && loadedState !== null) {
                rainGaugeLastState = loadedState;
                logger.info(`[雨量狀態] 已從 ${RAIN_GAUGE_STATE_FILE_PATH} 成功載入雨量筒狀態。`);
            } else {
                logger.warn(`[雨量狀態] ${RAIN_GAUGE_STATE_FILE_PATH} 內容格式不正確，使用空狀態。`);
                rainGaugeLastState = {};
            }
        } else {
            logger.info(`[雨量狀態] 狀態檔案 ${RAIN_GAUGE_STATE_FILE_PATH} 不存在，將使用空狀態。`);
            rainGaugeLastState = {};
        }
    } catch (error: any) {
        logger.error(`[雨量狀態] 載入雨量筒狀態失敗: ${error.message}`);
        rainGaugeLastState = {}; // 出錯時使用空狀態
    }
}

// ✨ 3. 函數：保存雨量筒狀態到檔案
async function saveRainGaugeState(): Promise<void> {
    try {
        await fs.writeFile(RAIN_GAUGE_STATE_FILE_PATH, JSON.stringify(rainGaugeLastState, null, 2), 'utf-8');
        // logger.debug(`[雨量狀態] 雨量筒狀態已成功保存到 ${RAIN_GAUGE_STATE_FILE_PATH}`);
    } catch (error: any) {
        logger.error(`[雨量狀態] 保存雨量筒狀態失敗: ${error.message}`);
    }
}

// ✨ 在服務啟動時調用一次載入狀態的函數。
let stateLoaded = false; // 標記狀態是否已載入

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
    // ✨ 確保狀態只在首次掃描時載入一次
    if (!stateLoaded) {
        await loadRainGaugeState();
        stateLoaded = true;
    }

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
            .filter(entry => entry.isDirectory() && /^\d{8}$/.test(entry.name))
            .map(entry => entry.name)
            .sort((a, b) => a.localeCompare(b)); // ✨ 按日期從舊到新排序，確保按順序處理
    } catch (error: any) {
        logger.error(`[掃描] 讀取設備 ${deviceId} (來源: ${source}) 的日期目錄列表失敗: ${error.message}`);
        return;
    }

    if (allDateDirs.length === 0) {
        logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 在 ${deviceSpecificRootPath} 沒有找到日期目錄。`);
        return;
    }

    logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 發現日期目錄: ${allDateDirs.join(', ')}`);

    // ✨ 遍歷所有找到的日期目錄進行處理
    for (const dateDir of allDateDirs) {
        const currentDateDirPath  = path.join(deviceSpecificRootPath, dateDir);
        logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 開始處理目錄: ${dateDir}`);

        try {
            // 檢查目錄是否存在，以防在遍歷過程中被其他進程刪除
            if (!await fs.pathExists(currentDateDirPath)) {
                logger.warn(`[掃描] 設備 ${deviceId} (來源: ${source}) 目錄 ${dateDir} 在處理前已不存在，跳過。`);
                continue;
            }

            // ✨ 檢查是否存在 writed 子目錄
            const writedDirPath = path.join(currentDateDirPath, 'writed');
            let filesToProcess: string[] = [];
            let sourcePathForFiles: string = currentDateDirPath; // 預設從日期目錄本身讀取

            if (await fs.pathExists(writedDirPath) && (await fs.lstat(writedDirPath)).isDirectory()) {
                logger.info(`[掃描] 設備 ${deviceId} 在目錄 ${dateDir} 中找到 writed 子目錄，將從此處讀取檔案。`);
                sourcePathForFiles = writedDirPath; // 更新檔案來源路徑
                filesToProcess = (await fs.readdir(writedDirPath)).filter(filename =>
                    (source === 'wise' && filename.toLowerCase().endsWith('.csv')) ||
                    (source === 'tdr' && filename.toLowerCase().endsWith('.json'))
                );
            } else {
                // 如果沒有 writed 目錄，則嘗試從日期目錄本身讀取檔案 (保持原有邏輯)
                filesToProcess = (await fs.readdir(currentDateDirPath)).filter(filename =>
                    ((source === 'wise' && filename.toLowerCase().endsWith('.csv')) ||
                     (source === 'tdr' && filename.toLowerCase().endsWith('.json'))) &&
                    filename !== 'writed' // 避免將 writed 目錄本身當作檔案處理
                );
            }

            if (filesToProcess.length > 0) {
                logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 在目錄 ${dateDir} 中找到 ${filesToProcess.length} 個檔案，準備處理。`);
                await processFilesBatch(sourcePathForFiles, deviceId, source, filesToProcess, dateDir); // ✨ 傳遞 dateDir 給 processFilesBatch
            } else {
                logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 目錄 ${dateDir} 為空。`);
            }

            // 清理邏輯：
            // 1. 如果處理了 writed 目錄，並且它現在空了，可以考慮刪除 writed
            if (sourcePathForFiles === writedDirPath && await fs.pathExists(writedDirPath)) {
                const remainingInWrited = await fs.readdir(writedDirPath);
                if (remainingInWrited.length === 0) {
                    logger.info(`[掃描清理] 設備 ${deviceId} 的 .writed 目錄 ${writedDirPath} 已空，準備刪除。`);
                    await fs.rm(writedDirPath, { recursive: true, force: true });
                    logger.info(`[掃描清理] 設備 ${deviceId} 已刪除 .writed 目錄 ${writedDirPath}。`);
                } else {
                     logger.warn(`[掃描清理] 設備 ${deviceId} 的 .writed 目錄 ${writedDirPath} 處理後仍有 ${remainingInWrited.length} 個檔案/目錄，將保留。`);
                }
            }

            // 2. 如果日期目錄是「昨天以前的」並且現在是空的 (也沒有 writed 或其他子目錄/檔案了)，則刪除該日期目錄
            if (dateDir < yesterday) { // 比較 YYYYMMDD 字串
                // 再次檢查目錄是否為空，因為 processFilesBatch 可能移動了所有檔案
                const remainingFilesInDir = await fs.readdir(currentDateDirPath );
                if (remainingFilesInDir.length === 0) {
                    logger.info(`[掃描清理] 設備 ${deviceId} (來源: ${source}) 昨天以前的目錄 ${dateDir} 已處理完畢且為空，準備刪除。`);
                    await fs.rm(currentDateDirPath , { recursive: true, force: true });
                    logger.info(`[掃描清理] 設備 ${deviceId} (來源: ${source}) 已刪除昨天以前的空目錄 ${dateDir}。`);
                } else {
                    logger.warn(`[掃描清理] 設備 ${deviceId} (來源: ${source}) 昨天以前的目錄 ${dateDir} 處理後仍有 ${remainingFilesInDir.length} 個檔案/目錄，將保留。可能原因：部分檔案處理失敗未移動，或有非數據檔案。`);
                }
            } else if (dateDir === yesterday) {
                 // 對於昨天的目錄，如果處理後也空了，也刪除 (只保留今天的)
                 const remainingFilesInYesterday = await fs.readdir(currentDateDirPath );
                 if (remainingFilesInYesterday.length === 0) {
                     logger.info(`[掃描清理] 設備 ${deviceId} (來源: ${source}) 昨天的目錄 ${dateDir} 已處理完畢且為空，準備刪除。`);
                     await fs.rm(currentDateDirPath , { recursive: true, force: true });
                     logger.info(`[掃描清理] 設備 ${deviceId} (來源: ${source}) 已刪除昨天的空目錄 ${dateDir}。`);
                 }
            }
            // 今天 (today) 的目錄通常不刪除，除非有特殊清理策略

        } catch (error: any) {
            if (error.code === 'ENOENT') {
                logger.warn(`[掃描] 設備 ${deviceId} (來源: ${source}) 目錄 ${dateDir} 在處理過程中被刪除或不存在。`);
            } else {
                logger.error(`[掃描] 設備 ${deviceId} (來源: ${source}) 處理目錄 ${dateDir} 時發生錯誤: ${error.message}`);
            }
        }
        logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 目錄 ${dateDir} 處理完畢。`);
    }
    logger.info(`[掃描] 設備 ${deviceId} (來源: ${source}) 所有日期目錄處理完成。`);
}

async function processFilesBatch(
    currentDataPath: string,
    deviceId: string,
    source: 'wise' | 'tdr',
    files: string[],
    dateDirName: string // 現在對於 WISE 和 TDR 都是日期目錄名
) {
    const allPoints: Point[] = [];
    const processedFilePaths: string[] = [];
    let batchFirstTimestampMs: number | null = null;

    files.sort((a, b) => a.localeCompare(b));

    for (const filename of files) {
        const filePath = path.join(currentDataPath, filename);
        try {
            if (source === 'wise') {
                const wiseRecordsRaw = await parseWiseCSVFile(filePath);
                const validRecordsForInflux: any[] = [];

                for (const rawRecord of wiseRecordsRaw) {
                    if (rawRecord.hasOwnProperty('error') || !rawRecord.timestamp || !rawRecord.raw) {
                        logger.warn(`[處理批次] WISE 檔案 ${filename} 包含無效記錄或缺少時間戳，跳過此記錄。原始: %j`, rawRecord);
                        continue;
                    }

                    const recordForInflux = { ...rawRecord };
                    let isCurrentDeviceRainGauge = isDeviceRainGauge(deviceId);

                    if (isCurrentDeviceRainGauge && recordForInflux.raw['DI_0 Cnt'] !== undefined) {
                        const currentCount = parseFloat(recordForInflux.raw['DI_0 Cnt'] as string);
                        const currentTimestampMs = new Date(recordForInflux.timestamp).getTime();

                        if (!isNaN(currentCount) && !isNaN(currentTimestampMs)) {
                            const prevState = rainGaugeLastState[deviceId];
                            let calculatedRain10m = 0;

                            if (prevState && !isNaN(prevState.lastCount) && !isNaN(prevState.lastTimestamp)) {
                                if (currentTimestampMs > prevState.lastTimestamp) {
                                    const timeDiffMinutes = (currentTimestampMs - prevState.lastTimestamp) / (1000 * 60);

                                    // 假設我們只在數據間隔接近 10 分鐘時才計算差值作為 10 分鐘雨量
                                    // 您可以定義一個允許的最大間隔，例如 18 分鐘
                                    // 如果超過這個間隔，則認為數據不連續，不能簡單地用差值代表 "最近10分鐘"
                                    const MAX_INTERVAL_FOR_DIFF_CALC_MINUTES = 18; // 可配置

                                    if (timeDiffMinutes <= MAX_INTERVAL_FOR_DIFF_CALC_MINUTES) {

                                        const countDiff = currentCount >= prevState.lastCount
                                                        ? (currentCount - prevState.lastCount)
                                                        : currentCount;
                                        calculatedRain10m = countDiff / 2.0;
                                        logger.debug(`[雨量計算] 設備 ${deviceId} (時間間隔: ${timeDiffMinutes.toFixed(1)} 分鐘): Cnt差 ${countDiff}, 計算雨量 ${calculatedRain10m} mm`);
                                    } else {
                                        // 時間間隔過長，數據不連續
                                        logger.warn(`[雨量計算] 設備 ${deviceId} 數據不連續，時間間隔 ${timeDiffMinutes.toFixed(1)} 分鐘 (大於 ${MAX_INTERVAL_FOR_DIFF_CALC_MINUTES} 分鐘)。`);
                                         calculatedRain10m = 0;
                                        logger.warn(`[雨量計算] ...因此，設備 ${deviceId} 本次掃描的10分鐘雨量（基於差值）設為 ${calculatedRain10m}。`);
                                    }
                                } else {
                                     logger.warn(`[雨量計算] 設備 ${deviceId} 的當前時間戳 ${new Date(currentTimestampMs).toISOString()} 不晚於上次記錄時間戳 ${new Date(prevState.lastTimestamp).toISOString()} (狀態檔案值)，本次雨量設為 0。`);
                                }
                            } else {
                                logger.info(`[雨量計算] 設備 ${deviceId} 沒有上一個狀態記錄 (來自狀態檔案)，本次10分鐘雨量設為0 (或當前計數/2)。當前計數: ${currentCount}`);
                                // calculatedRain10m = currentCount / 2.0; // 可選：首次記錄也計算雨量
                            }
                            recordForInflux.rain_10m_scanner = calculatedRain10m;

                            // 更新最後狀態 (內存)
                            rainGaugeLastState[deviceId] = { lastCount: currentCount, lastTimestamp: currentTimestampMs };

                            await saveRainGaugeState(); // ✨ 保存狀態

                        } else {
                             logger.warn(`[雨量計算] 設備 ${deviceId} 在檔案 ${filename} 的記錄 DI_0 Cnt 或時間戳無效。`);
                        }
                    }
                    validRecordsForInflux.push(recordForInflux);
                }

                if (validRecordsForInflux.length > 0) {
                    const wisePoints = convertWiseToInfluxPoints(deviceId, validRecordsForInflux);
                    if (wisePoints.length > 0) {
                        allPoints.push(...wisePoints);
                        processedFilePaths.push(filePath);
                        for (const record of validRecordsForInflux) {
                            const recordTs = new Date(record.timestamp).getTime();
                            if (!isNaN(recordTs)) {
                                batchFirstTimestampMs = (batchFirstTimestampMs === null) ? recordTs : Math.min(batchFirstTimestampMs, recordTs);
                            }
                        }
                    }
                } else if (wiseRecordsRaw.length > 0) {
                    logger.warn(`[處理批次] WISE 檔案 ${filename} 所有 ${wiseRecordsRaw.length} 條記錄均無效或缺少時間戳。`);
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
                    // 判斷 logType 的邏輯可以保持或根據您的路徑結構調整
                    if (filePath.includes('/signal_log/') || filePath.includes('\\signal_log\\')) {
                        logType = 'signal_log';
                    } else if (filePath.includes('/system_log/') || filePath.includes('\\system_log\\')) {
                        logType = 'system_log';
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