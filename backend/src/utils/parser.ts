import fs from 'fs-extra';
import csv from 'csv-parser';
import { logger } from './logger';
import { TdrPayload } from '../services/influxDataService';

/**
 * @fileoverview Utility functions for parsing different file formats.
 */

// --- CSV Parsing Logic ---

/**
 * 格式化 CSV 數據行
 * 將原始格式：
 * PE,TIM,AI_0 EgF,AI_0 PEgF,AI_0 Evt,AI_1 EgF,...
 * 轉換為結構化對象
 * 
 * @param data - CSV 解析器提供的原始數據行
 * @returns 結構化的數據對象
 */
function formatWiseCSVData(data: Record<string, string>): {
  timestamp: string;
  channels: Record<string, Record<string, number>>;
  raw: Record<string, string>;
} | { error: string; raw: Record<string, string> } {
  try {
    const timestamp = data.TIM; // 時間戳欄位
    const channels: Record<string, Record<string, number>> = {};
    const channelPrefix = 'AI_';

    Object.keys(data).forEach((key) => {
      /* 1️⃣ 既有 AI_* 邏輯 */
      if (key.startsWith('AI_')) {
        const [channel, metric] = key.split(' ');
        channels[channel] ??= {};
        channels[channel][metric] = parseFloat(data[key]);
      }
  
      /* 2️⃣ 新增：DI_* Cnt (雨量筒) */
      if (key.startsWith('DI_') && key.endsWith('Cnt')) {
        const channel = key.split(' ')[0];      // DI_0
        channels[channel] ??= {};
        channels[channel].Cnt = parseFloat(data[key]);
      }
    });

    return { timestamp, channels, raw: data };
  } catch (error: any) {
    logger.error(`格式化 CSV 數據錯誤: ${error.message}`);
    return { error: '數據格式化錯誤', raw: data };
  }
}


/**
 * 解析 CSV 文件
 * @param filePath - CSV 文件路徑
 * @returns 解析後的數據陣列
 */
export async function parseWiseCSVFile(filePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];

    fs.createReadStream(filePath)
      .on('error', (error) => {
        logger.error(`讀取文件 ${filePath} 錯誤: ${error.message}`);
        reject(error);
      })
      .pipe(csv())
      .on('data', (data: Record<string, string>) => {
        const formattedData = formatWiseCSVData(data);
        results.push(formattedData);
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        logger.error(`解析 CSV 文件 ${filePath} 錯誤: ${error.message}`);
        reject(error);
      });
  });
}

// --- JSON Parsing Logic (for TDR) ---

/**
 * 解析 TDR JSON 文件。
 * TDR JSON 檔案包含一個頂層的 timestamp 和一個 data 陣列。
 * 為了與 parseWiseCSVFile 的返回結構盡可能相似（返回一個記錄陣列），
 * 此函數將在成功時返回一個包含單個 TdrPayload 物件的陣列。
 *
 * @param filePath - JSON 文件路徑
 * @returns Promise<TdrPayload[]> - 如果成功，返回包含一個 TdrPayload 的陣列；否則返回空陣列。
 */
export async function parseTdrJSONFile(filePath: string): Promise<TdrPayload[]> {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const jsonData = JSON.parse(fileContent);

      // 結構驗證 (與 influxDataService 中的 TdrPayload 介面對應)
    if (
      typeof jsonData === 'object' &&
      jsonData !== null &&
      typeof jsonData.timestamp === 'string' &&
      Array.isArray(jsonData.data) &&
      (jsonData.data.length === 0 || // 允許空 data 陣列
        ( // 如果 data 陣列不為空，檢查第一個元素的結構
         jsonData.data.length > 0 &&
         typeof jsonData.data[0] === 'object' &&
         jsonData.data[0] !== null &&
         typeof jsonData.data[0].distance_m === 'number' &&
         typeof jsonData.data[0].rho === 'number'
        )
      )
    ) {
      logger.info(`[JSON Parser] 文件 ${filePath} 解析成功。`);
      return [jsonData as TdrPayload];
    } else {
      logger.warn(`[JSON Parser] JSON 檔案 ${filePath} 結構不符合預期的 TdrPayload。檔案內容預覽: ${fileContent.substring(0, 200)}...`);
      return [];
    }
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      logger.error(`[JSON Parser] 解析 JSON 檔案 ${filePath} 語法錯誤: ${error.message}`);
    } else if (error.code === 'ENOENT') {
      logger.error(`[JSON Parser] 檔案不存在: ${filePath}`);
    }
    else {
      logger.error(`[JSON Parser] 讀取或解析 JSON 檔案 ${filePath} 發生錯誤: ${error.message}`);
    }
    return [];
  }
}