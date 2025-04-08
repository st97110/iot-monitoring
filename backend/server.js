const app = require('./app');
const { PORT } = require('./config/config');
const logger = require('./utils/logger');
const dataScanScheduler = require('./schedulers/dataScanScheduler');

// 啟動定時資料掃描任務
dataScanScheduler.start();

// 啟動伺服器
const server = app.listen(PORT, () => {
  logger.info(`伺服器在 http://localhost:${PORT} 啟動`);
});

// 優雅關閉處理
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  logger.info('收到關閉信號，準備關閉...');
  dataScanScheduler.stop();
  server.close(() => {
    logger.info('伺服器已關閉');
    process.exit(0);
  });
  
  // 如果 10 秒後還未關閉，強制退出
  setTimeout(() => {
    logger.error('強制關閉');
    process.exit(1);
  }, 10000);
}
