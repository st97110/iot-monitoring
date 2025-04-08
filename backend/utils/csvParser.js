const fs = require('fs');
const csv = require('csv-parser');
const logger = require('./logger');

/**
 * 解析 CSV 文件
 * @param {string} filePath - CSV 文件路徑
 * @returns {Promise<Array>} 解析後的數據陣列
 */
const parseCSVFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(filePath)
      .on('error', (error) => {
        logger.error(`讀取文件 ${filePath} 錯誤: ${error.message}`);
        reject(error);
      })
      .pipe(csv())
      .on('data', (data) => {
        // 轉換數據格式
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
};

/**
 * 格式化 CSV 數據行
 * 將原始格式：
 * PE,TIM,AI_0 EgF,AI_0 PEgF,AI_0 Evt,AI_1 EgF,...
 * 轉換為結構化對象
 * 
 * @param {Object} data - CSV 解析器提供的原始數據行
 * @returns {Object} 結構化的數據對象
 */
const formatCsvData = (data) => {
  try {
    // 假設 CSV 頭部是 PE,TIM,AI_0 EgF,AI_0 PEgF,AI_0 Evt,...
    const timestamp = data.TIM; // 時間戳欄位
    
    // 將數據組織成通道結構
    const channels = {};
    const channelPrefix = 'AI_';
    
    // 遍歷 data 對象的所有屬性
    Object.keys(data).forEach(key => {
      // 檢查是否是 AI_X 類型屬性
      if (key.includes(channelPrefix)) {
        const [channel, metric] = key.split(' ');
        
        // 如果該通道還沒有在結果中，創建它
        if (!channels[channel]) {
          channels[channel] = {};
        }
        
        // 將度量值轉換為數字並添加到通道中
        channels[channel][metric] = parseFloat(data[key]);
      }
    });
    
    // 返回結構化數據
    return {
      timestamp,
      channels,
      raw: data // 保留原始數據以備參考
    };
  } catch (error) {
    logger.error(`格式化 CSV 數據錯誤: ${error.message}`);
    return { error: '數據格式化錯誤', raw: data };
  }
};

module.exports = {
  parseCSVFile
};
