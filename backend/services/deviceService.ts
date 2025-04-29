// backend/services/deviceService.ts
import fs from 'fs-extra';
import path from 'path';
import { queryDeviceListFromInflux } from './influxClientService';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export interface DeviceInfo {
  id: string;
  name: string;
  model: string;
  lastUpdated: string | null;
  totalRecords: number;
  hasData: boolean;
  error?: string;
}

/**
 * 從 InfluxDB 查詢設備列表
 */
export async function getAllDevicesFromDB(source: 'wise' | 'tdr'): Promise<DeviceInfo[]> {
  try {
    if (source === 'wise') {
      const wise_ids = await queryDeviceListFromInflux('wise');
      return wise_ids.map(id => ({
        id,
        name: id.split('_')[1] || id,
        model: id.split('_')[0] || 'WISE',
        lastUpdated: null,
        totalRecords: 0,
        hasData: true,
      }));
    } else {
      const tdr_ids = await queryDeviceListFromInflux('tdr');
      return tdr_ids.map(id => ({
        id,
        name: id.split('_')[1] || id,
        model: 'TDR',
        lastUpdated: null,
        totalRecords: 0,
        hasData: true,
      }));
    }
    
  } catch (error: any) {
    logger.error(`從 InfluxDB 讀取設備列表錯誤: ${error.message}`);
    return [];
  }
}

/**
 * 從資料夾推算設備列表
 */
export async function getAllDevicesFromFolder(source: 'wise' | 'tdr'): Promise<DeviceInfo[]> {
  try {
    const baseFolder = source === 'wise' ? config.folder.wiseDataDir : config.folder.tdrDataDir;
    const entries = await fs.readdir(baseFolder, { withFileTypes: true });

    const devices: DeviceInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && (entry.name.startsWith('WISE-') || entry.name.startsWith('TDR-'))) {
        const devicePath = path.join(baseFolder, entry.name);
        const deviceInfo = await getDeviceInfo(entry.name, devicePath, source);
        devices.push(deviceInfo);
      }
    }

    return devices;
  } catch (error: any) {
    logger.error(`從資料夾讀取設備列表錯誤: ${error.message}`);
    return [];
  }
}

/**
 * 獲取特定設備的詳細信息
 * @param deviceId - 設備ID
 * @param devicePath - 設備目錄路徑
 * @returns 設備詳細信息
 */
async function getDeviceInfo(deviceId: string, devicePath: string, source: 'wise' | 'tdr'): Promise<DeviceInfo> {
  try {
    const dataPath = source === 'wise'
      ? path.join(devicePath, 'signal_log')
      : devicePath; // TDR 直接 device 資料夾

    const hasData = await fs.pathExists(dataPath);

    let lastUpdated: string | null = null;
    let totalRecords = 0;

    if (hasData) {
      const dateDirs = await fs.readdir(dataPath);
      if (dateDirs.length > 0) {
        dateDirs.sort((a, b) => b.localeCompare(a)); // 新到舊排序
        const latestDateDir = path.join(dataPath, dateDirs[0]);

        const files = await fs.readdir(latestDateDir);
        if (files.length > 0) {
          files.sort((a, b) => b.localeCompare(a));
          const latestFile = files[0];
          const timestamp = latestFile.split('.')[0]; // 假設檔名是時間戳

          lastUpdated = `${dateDirs[0]}T${timestamp}`;
          totalRecords = await countTotalRecords(dataPath);
        }
      }
    }

    return {
      id: deviceId,
      name: deviceId.split('_')[1] || deviceId,
      model: deviceId.split('_')[0] || 'Unknown',
      lastUpdated,
      totalRecords,
      hasData
    };
  } catch (error: any) {
    logger.error(`獲取設備 ${deviceId} 詳細資訊錯誤: ${error.message}`);
    return {
      id: deviceId,
      name: deviceId.split('_')[1] || '未知',
      model: deviceId.split('_')[0] || '未知',
      lastUpdated: null,
      totalRecords: 0,
      hasData: false,
      error: '無法讀取設備詳情'
    };
  }
}

/**
 * 計算設備的數據記錄總數
 * @param signalLogPath - 信號日誌目錄路徑
 * @returns 記錄總數估計
 */
async function countTotalRecords(signalLogPath: string): Promise<number> {
  try {
    let total = 0;
    const dateDirs = await fs.readdir(signalLogPath);
    
    // 為了效率，我們只計算最近5天的
    const recentDays = dateDirs.sort((a, b) => b.localeCompare(a)).slice(0, 5);
    
    for (const dateDir of recentDays) {
      const dirPath = path.join(signalLogPath, dateDir);
      const files = await fs.readdir(dirPath);
      total += files.length; // 假設每個文件是一條記錄
    }
    
    // 如果有超過5天的數據，用平均數乘以總天數估算
    if (dateDirs.length > 5) {
      const avgPerDay = total / recentDays.length;
      total = Math.round(avgPerDay * dateDirs.length);
    }
    
    return total;
  } catch (error: any) {
    logger.error(`計算記錄數錯誤: ${error.message}`);
    return 0;
  }
};