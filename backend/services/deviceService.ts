import fs from 'fs-extra';
import path from 'path';
import { queryDeviceListFromInflux } from './influxService';
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
    const wise_ids = await queryDeviceListFromInflux('wise');
    return wise_ids.map(id => ({
      id,
      name: id.split('_')[1] || id,
      model: id.split('_')[0] || 'Unknown',
      lastUpdated: null,
      totalRecords: 0,
      hasData: true,
    }));
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
    const entries = await fs.readdir(config.dataDir, { withFileTypes: true });
    const devices: DeviceInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('WISE-')) {
        devices.push({
          id: entry.name,
          name: entry.name.split('_')[1] || entry.name,
          model: entry.name.split('_')[0] || 'Unknown',
          lastUpdated: null,
          totalRecords: 0,
          hasData: true
        });
      }
    }

    return devices;
  } catch (error: any) {
    logger.error(`從資料夾讀取設備列表錯誤: ${error.message}`);
    return [];
  }
}

/**
 * 獲取所有儀器設備列表
 * @returns 設備列表，包含ID和其他信息
 */
export async function getAllDevices(): Promise<DeviceInfo[]> {
  try {
    const entries = await fs.readdir(config.dataDir, { withFileTypes: true });
    const devices: DeviceInfo[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('WISE-')) {
        const devicePath = path.join(config.dataDir, entry.name);
        const deviceInfo = await getDeviceInfo(entry.name, devicePath);
        devices.push(deviceInfo);
      }
    }
    
    return devices;
  } catch (error: any) {
    logger.error(`讀取設備列表錯誤: ${error.message}`);
    throw new Error('無法讀取設備列表');
  }
};

/**
 * 獲取特定設備的詳細信息
 * @param deviceId - 設備ID
 * @param devicePath - 設備目錄路徑
 * @returns 設備詳細信息
 */
export async function getDeviceInfo(deviceId: string, devicePath: string): Promise<DeviceInfo> {
  try {
    const signalLogPath = path.join(devicePath, 'signal_log');
    const hasData = await fs.pathExists(signalLogPath);
    
    let lastUpdated = null;
    let totalRecords = 0;
    
    if (hasData) {
      // 獲取最新數據時間
      const dateDirs = await fs.readdir(signalLogPath);
      if (dateDirs.length > 0) {
        // 按日期排序
        dateDirs.sort((a, b) => b.localeCompare(a));
        const latestDateDir = path.join(signalLogPath, dateDirs[0]);
        
        // 獲取最新文件
        const files = await fs.readdir(latestDateDir);
        if (files.length > 0) {
          files.sort((a, b) => b.localeCompare(a));
          const latestFile = files[0];
          const timestamp = latestFile.split('.')[0]; // 假設文件名是時間戳
          
          // 更新時間為目錄名+文件名
          lastUpdated = `${dateDirs[0]}T${timestamp}`;
          
          // 計算記錄總數
          totalRecords = await countTotalRecords(signalLogPath);
        }
      }
    }
    
    return {
      id: deviceId,
      name: deviceId.split('_')[1], // 提取MAC地址部分作為名稱
      model: deviceId.split('_')[0], // 提取模型部分
      lastUpdated,
      totalRecords,
      hasData
    };
  } catch (error: any) {
    logger.error(`獲取設備 ${deviceId} 詳情錯誤: ${error.message}`);
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
};

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