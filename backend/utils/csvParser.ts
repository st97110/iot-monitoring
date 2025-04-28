import fs from 'fs';
import csv from 'csv-parser';
import { logger } from './logger';

/**
 * 格式化 CSV 數據行
 * 將原始格式：
 * PE,TIM,AI_0 EgF,AI_0 PEgF,AI_0 Evt,AI_1 EgF,...
 * 轉換為結構化對象
 * 
 * @param data - CSV 解析器提供的原始數據行
 * @returns 結構化的數據對象
 */
function formatCsvData(data: Record<string, string>): {
  timestamp: string;
  channels: Record<string, Record<string, number>>;
  raw: Record<string, string>;
} | { error: string; raw: Record<string, string> } {
  try {
    const timestamp = data.TIM; // 時間戳欄位
    const channels: Record<string, Record<string, number>> = {};
    const channelPrefix = 'AI_';

    Object.keys(data).forEach((key) => {
      if (key.includes(channelPrefix)) {
        const [channel, metric] = key.split(' ');

        if (!channels[channel]) {
          channels[channel] = {};
        }

        channels[channel][metric] = parseFloat(data[key]);
      }
    });

    return {
      timestamp,
      channels,
      raw: data,
    };
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
export async function parseCSVFile(filePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];

    fs.createReadStream(filePath)
      .on('error', (error) => {
        logger.error(`讀取文件 ${filePath} 錯誤: ${error.message}`);
        reject(error);
      })
      .pipe(csv())
      .on('data', (data: Record<string, string>) => {
        const formattedData = formatCsvData(data);
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