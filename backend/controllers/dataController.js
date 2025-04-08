const dataService = require('../services/dataService');
const logger = require('../utils/logger');

// 獲取所有儀器的最新數據
const getLatestData = async (req, res) => {
  try {
    const deviceId = req.query.deviceId; // 可選參數
    const data = await dataService.getLatestData(deviceId);
    res.json(data);
  } catch (error) {
    logger.error(`獲取最新數據錯誤: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
};

// 獲取特定儀器在日期區間內的歷史數據
const getHistoryData = async (req, res) => {
    let { deviceId, startDate, endDate, limit, offset } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: '缺少 startDate 或 endDate' });
    }
    
    try {
      // 從檔案抓出所有資料
      const allData = await dataService.getHistoryData(deviceId, startDate, endDate);

      // 時間新到舊排序
      allData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // 分頁
      const slicedData = (!isNaN(limit) && !isNaN(offset))
        ? allData.slice(offset, offset + limit)
        : allData;

      // 回傳
      res.json(slicedData);
    } catch (err) {
      logger.error('取得歷史資料錯誤', err);
      res.status(500).json({ error: '伺服器錯誤' });
    }
};

module.exports = {
  getLatestData,
  getHistoryData
};
