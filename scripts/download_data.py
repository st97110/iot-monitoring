import argparse
import subprocess
import os
import shutil
from datetime import datetime
from dateutil.relativedelta import relativedelta # 需要安裝 python-dateutil

# --- 配置 ---
# InfluxDB CT 的連接資訊 (使用者名稱@主機)
INFLUXDB_CT_HOST = 'root@192.168.68.101'
# 遠程數據的基礎路徑
REMOTE_BASE_PATH = '/srv/mondata/wise_backup_data/signal_log'
# 本地臨時存儲目錄
LOCAL_TEMP_DIR = 'temp_download'

def download_folders_by_prefix(prefix):
    """根據指定的前綴 (WISE 或 TDR) 下載所有匹配的資料夾中 "上個月" 的數據"""
    
    print(f"--- 開始處理前綴為 '{prefix}' 的資料夾 ---")

    # 1. 計算上個月的年份和月份
    today = datetime.now()
    last_month_date = today - relativedelta(months=1)
    last_month_str = last_month_date.strftime('%Y%m') # 格式為 YYYYMM, 例如 "202510"
    print(f"目標月份: {last_month_str}")

    # 2. 準備本地臨時目錄
    if os.path.exists(LOCAL_TEMP_DIR):
        shutil.rmtree(LOCAL_TEMP_DIR)
    os.makedirs(LOCAL_TEMP_DIR)
    print(f"已創建臨時目錄: {LOCAL_TEMP_DIR}")

    # 3. 構建遠程路徑的 glob 模式
    # 例如：/srv/mondata/wise_backup_data/signal_log/WISE-*/202510*
    remote_path_pattern = f"{REMOTE_BASE_PATH}/{prefix}-*/{last_month_str}*"
    
    # 4. 使用 scp -r 遞迴下載所有匹配的資料夾
    # 完整的 scp 命令看起來像: scp -r root@192.168.68.101:'/srv/.../WISE-*/202510*' ./temp_download/
    remote_source = f"{INFLUXDB_CT_HOST}:'{remote_path_pattern}'" # 注意單引號，防止 shell 在本地展開 '*'
    local_destination = f"./{LOCAL_TEMP_DIR}/"

    print(f"正在執行 SCP 命令: scp -r {remote_source} {local_destination}")
    
    try:
        # 使用 shell=True 是為了能正確處理帶有 '*' 的遠程路徑
        subprocess.run(
            f'scp -r {remote_source} {local_destination}',
            shell=True,
            check=True,
            capture_output=True,
            text=True
        )
    except subprocess.CalledProcessError as e:
        print(f"錯誤: 下載資料夾失敗。")
        if "No such file or directory" in e.stderr:
            print(f"在遠程伺服器上找不到任何匹配 '{prefix}-*/{last_month_str}*' 模式的資料夾。")
            return None
        else:
            print(f"SCP Error: {e.stderr}")
            return None

    # 5. 檢查是否有檔案被下載
    if not os.listdir(LOCAL_TEMP_DIR):
        print(f"警告: 雖然 SCP 命令成功，但在 '{LOCAL_TEMP_DIR}' 中沒有下載任何檔案。可能是遠程沒有匹配的資料夾。")
        return None

    # 6. 將下載的檔案打包成 zip
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    zip_filename_base = f"backup_{prefix}_{last_month_str}_{timestamp}" # 在檔名中加入月份信息
    zip_filepath = shutil.make_archive(zip_filename_base, 'zip', LOCAL_TEMP_DIR)
    
    print(f"--- 成功將檔案打包為: {zip_filepath} ---")
    
    # 7. 清理臨時目錄
    shutil.rmtree(LOCAL_TEMP_DIR)
    
    return zip_filepath

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='根據指定的前綴 (WISE 或 TDR) 下載並打包 "上個月" 的備份數據。')
    parser.add_argument('prefix', type=str, choices=['WISE', 'TDR'], help='要下載的資料夾前綴 (WISE 或 TDR)')
    args = parser.parse_args()
    
    final_zip_file = download_folders_by_prefix(args.prefix)
    
    if final_zip_file:
        with open(os.environ['GITHUB_OUTPUT'], 'a') as hf:
            print(f'zip_filename={final_zip_file}', file=hf)