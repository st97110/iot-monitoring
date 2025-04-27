// routes/tdrRoutes.js
const express  = require('express');
const path     = require('path');
const fs       = require('fs-extra');
const multer   = require('multer');
const { DATA_DIR } = require('../config/config');
const router   = express.Router();

/** 自訂儲存位置（依裝置 & 日期） */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const { deviceId } = req.body;
    if (!deviceId) return cb(new Error('缺少 deviceId'));

    // e.g. DATA_DIR/TDR_T1/signal_log/20250422
    const today     = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const dir       = path.join(DATA_DIR, deviceId, 'signal_log', today);
    await fs.mkdirp(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname)  // 用原檔名
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 }   // 200 KB：30 KB × 安全餘量
});

/** POST /api/tdr/upload */
router.post('/tdr/upload', upload.single('file'), (req, res) => {
  res.json({ ok: 1, path: req.file.path });
});

module.exports = router;
