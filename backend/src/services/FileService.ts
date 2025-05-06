import fs from 'fs-extra';
import path from 'path';

/**
 * 儲存上傳的 CSV 檔案
 * @param baseDir - 資料存放的根目錄 (wiseDataDir or tdrDataDir)
 * @param deviceFolderName - 裝置資料夾名稱（如 WISE-xxxx 或 TDR-xxxx）
 * @param dateFolderName - 日期資料夾名稱（YYYYMMDD）
 * @param filename - 最後檔案名稱
 * @param buffer - 檔案內容
 * @param logType - (可選) logType（如 signal_log 或 system_log）；TDR可以不帶
 */
export async function saveFile(
  baseDir: string,
  deviceFolderName: string,
  dateFolderName: string,
  filename: string,
  buffer: Buffer,
  logType?: string
): Promise<void> {
  const segments = [baseDir, deviceFolderName];
  if (logType) segments.push(logType);
  segments.push(dateFolderName);

  const dataDir = path.join(...segments);
  await fs.ensureDir(dataDir);

  const targetPath = path.join(dataDir, filename);
  const finalTargetPath = await getUniqueFileName(targetPath);

  await fs.writeFile(finalTargetPath, buffer.toString('utf8'), 'utf8');
}

/**
 * 搬移 CSV 檔案到 backup 資料夾
 * @param originalPath 原始檔案路徑
 * @param deviceFolderName 裝置資料夾名稱（如：WISE-xxx）
 * @param dateFolderName 日期資料夾名稱（如：20250428）
 * @param backupBaseDir 備份根目錄 (wiseBackupDir or tdrBackupDir)
 * @param logType 可選：signal_log 或 system_log（僅 WISE 有）
 */
export async function moveFileAfterWrite(
  originalPath: string,
  deviceFolderName: string,
  dateFolderName: string,
  backupBaseDir: string,
  logType?: string
): Promise<void> {
  const segments = [backupBaseDir];
  if (logType) segments.push(logType);
  segments.push(deviceFolderName, dateFolderName);

  const backupDir = path.join(...segments);
  fs.ensureDirSync(path.dirname(backupDir));  // 確保上一層目錄
  await fs.ensureDir(backupDir);

  const filename = path.basename(originalPath);
  const targetPath = path.join(backupDir, filename);

  const finalTargetPath = await getUniqueFileName(targetPath);

  await fs.move(originalPath, finalTargetPath, { overwrite: false });
}

/**
 * 防止檔名衝突，自動加 (1)、(2) 等
 * @param filePath - 原本的檔案路徑
 * @returns - 可用的新路徑
 */
async function getUniqueFileName(filePath: string): Promise<string> {
  let newPath = filePath;
  let count = 1;

  while (await fs.pathExists(newPath)) {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    newPath = path.join(dir, `${base} (${count})${ext}`);
    count++;
  }

  return newPath;
}
