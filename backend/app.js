const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { PORT } = require('./config/config');
const deviceRoutes = require('./routes/deviceRoutes');
const dataRoutes = require('./routes/dataRoutes');
const logger = require('./utils/logger');

// 初始化 Express 應用
const app = express();

// 中間件
app.use(helmet()); // 安全頭設置
app.use(cors()); // 允許跨域請求
app.use(express.json()); // 解析 JSON 請求體
app.use(morgan('dev')); // HTTP 請求日誌

// 路由
app.use('/api', deviceRoutes);
app.use('/api', dataRoutes);

// 基本路由
app.get('/', (req, res) => {
  res.json({ message: '儀器監測數據 API 服務運行中' });
});

// 錯誤處理中間件
app.use((req, res, next) => {
  res.status(404).json({ error: '找不到請求的資源' });
});

app.use((err, req, res, next) => {
  logger.error(`錯誤: ${err.message}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? '伺服器錯誤' : err.message
  });
});

module.exports = app;
