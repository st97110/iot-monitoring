const cron = require('node-cron');
const scannerService = require('../services/scannerService');
const { SCAN_INTERVAL } = require('../config/config');
const logger = require('../utils/logger');

// 轉換秒間隔為 cron 表達式
const getCronExpression = (seconds) => {
  // cron 最小間隔為分鐘，如果秒數小於60，則使用秒級的表達式
  if (seconds < 60) {
    return `*/${seconds} * * * * *`; // 每隔 x 秒執行一次
  } else {
    const minutes = Math.floor(seconds / 60);
    return `0 */${minutes} * * * *`; // 每隔 x 分鐘執行一次
  }
};

// 創建定時任務
let scanTask;

/**
 * 啟動定時掃描任務
 */
const start = () => {
  if (scanTask) {
    logger.info('掃描任務已在運行中，先停止舊任務');
    stop();
  }

  // 創建 cron 表達式
  const cronExpression = getCronExpression(SCAN_INTERVAL);
  logger.info(`配置定時掃描任務，間隔: ${SCAN_INTERVAL} 秒, cron: ${cronExpression}`);

  // 設置定時任務
  scanTask = cron.schedule(cronExpression, async () => {
    logger.info('執行定時數據掃描');
    try {
      await scannerService.scanLatestData();
    } catch (error) {
      logger.error(`定時掃描任務錯誤: ${error.message}`);
    }
  });

  logger.info('定時掃描任務已啟動');
  
  // 立即執行一次掃描
  scannerService.scanLatestData()
    .catch(error => logger.error(`初始掃描錯誤: ${error.message}`));
};

/**
 * 停止掃描任務
 */
const stop = () => {
  if (scanTask) {
    scanTask.stop();
    scanTask = null;
    logger.info('定時掃描任務已停止');
  }
};

module.exports = {
  start,
  stop
};
