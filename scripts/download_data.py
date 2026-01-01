import argparse
import subprocess
import os
import shutil
import json
import glob
from datetime import datetime
from dateutil.relativedelta import relativedelta
import pandas as pd  # 需要安裝 pandas

# --- 配置 ---
CONFIG_FILE_PATH = 'scripts/devices.json'
INFLUXDB_CT_HOST = '192.168.68.101' # 注意：這裡只寫 IP，用戶名寫在 SSH 指令中
SSH_USER = 'root'
LOCAL_TEMP_DIR = 'temp_download'

def merge_daily_files(instrument_dir):
    """
    遍歷儀器目錄，將每天(YYYYMMDD)資料夾內的 CSV 合併成一個單獨的 CSV 檔
    """
    # 假設目錄結構: temp/OW5/20231001/*.csv
    
    # 找出該儀器目錄下所有的日期資料夾 (假設是8位數字)
    day_folders = [f for f in os.scandir(instrument_dir) if f.is_dir() and f.name.isdigit() and len(f.name) == 8]
    
    for day_folder in day_folders:
        day_path = day_folder.path
        csv_files = glob.glob(os.path.join(day_path, "*.csv"))
        
        if not csv_files:
            continue
            
        print(f"  -> 正在合併 {day_folder.name} 的 {len(csv_files)} 個檔案...")
        
        try:
            # 讀取所有 CSV 並合併
            # 假設這些小檔案格式一致，且沒有 Header 或 Header 需要處理
            # 這裡假設小檔案沒有 Header，或者我們只保留第一個檔案的 Header
            # 為了安全起見，建議加上 error_bad_lines=False 或類似處理
            df_list = []
            for file in csv_files:
                try:
                    # 根據實際情況調整：如果小檔案沒標題用 header=None
                    df_list.append(pd.read_csv(file)) 
                except pd.errors.EmptyDataError:
                    pass
            
            if df_list:
                merged_df = pd.concat(df_list, ignore_index=True)
                
                # 根據 timestamp 排序 (可選)
                if 'timestamp' in merged_df.columns:
                    merged_df = merged_df.sort_values(by='timestamp')
                
                # 輸出合併後的檔案：temp/OW5/20231001.csv
                output_csv = os.path.join(instrument_dir, f"{day_folder.name}.csv")
                merged_df.to_csv(output_csv, index=False)
                
                # 刪除原始日期資料夾 (清理小檔案)
                shutil.rmtree(day_path)
        except Exception as e:
            print(f"  -> 合併失敗 {day_folder.name}: {e}")

def download_by_group(group_name):
    print(f"--- 開始處理儀器組: {group_name} ---")

    # 1. 讀取並解析配置文件
    try:
        with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
            devices_config = json.load(f)
    except FileNotFoundError:
        print(f"錯誤: 配置文件 '{CONFIG_FILE_PATH}' 不存在！")
        return None
    
    # 2. 獲取該組的所有儀器 ID
    device_ids = devices_config.get('groups', {}).get(group_name)
    if not device_ids:
        print(f"錯誤: 在配置文件中找不到名為 '{group_name}' 的儀器組。")
        return None
    
    last_month_str = (datetime.now() - relativedelta(months=1)).strftime('%Y%m')
    print(f"目標月份: {last_month_str}")

    # 3. 準備本地臨時目錄
    if os.path.exists(LOCAL_TEMP_DIR):
        shutil.rmtree(LOCAL_TEMP_DIR)
    os.makedirs(LOCAL_TEMP_DIR)

    # 4. 逐一為組內的每個儀器下載數據
    download_count = 0
    rename_map = {} # 用來存儲原始文件夾名和新文件夾名的映射
    
    for device_id in device_ids:
        device_info = devices_config.get('devices', {}).get(device_id)
        if not device_info:
            print(f"警告: 找不到 '{device_id}' 的設定。")
            continue
            
        remote_path = device_info.get('remote_path')
        folder_name = device_info.get('folder_name', device_id) # 如果沒定義，就用 ID 作為文件夾名
        
        # 將ID和文件夾名添加到映射中
        rename_map[device_id] = folder_name
        
        # 準備本地目錄
        instrument_temp_dir = os.path.join(LOCAL_TEMP_DIR, device_id)
        os.makedirs(instrument_temp_dir, exist_ok=True)
        
        print(f"正在下載 {device_id} (優化模式)...")
        
        # --- 優化重點：使用 Tar Pipe 下載 ---
        # 原理：在遠端執行 tar 打包 -> 透過 SSH 串流傳輸 -> 本地 tar 解壓
        # 這比 scp -r 傳輸幾千個小檔案快非常多
        
        # 遠端命令：找到符合月份的資料夾，打包輸出到 stdout
        # 這裡使用 find 或 wildcards 配合 tar
        # 注意：remote_path 下面是 YYYYMMDD 的資料夾
        # 我們要抓的是 startswith(YYYYMM) 的資料夾
        
        remote_cmd = f"tar -cz -C {remote_path} . --wildcards '{last_month_str}*'"
        
        try:
            # 構建 SSH 命令
            # 注意：這裡假設 runner 已經配好 SSH Key
            ssh_cmd = ["ssh", f"{SSH_USER}@{INFLUXDB_CT_HOST}", remote_cmd]
            
            # 執行 SSH 並將輸出 pipe 到本地解壓
            # tar -xz -C <本地目錄>
            with subprocess.Popen(ssh_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as ssh_proc:
                # 本地解壓命令
                tar_cmd = ["tar", "-xz", "-C", instrument_temp_dir]
                tar_proc = subprocess.run(tar_cmd, stdin=ssh_proc.stdout, stderr=subprocess.PIPE)
                
                # 檢查 SSH 是否報錯 (例如找不到檔案 tar 會報錯)
                ssh_stderr = ssh_proc.stderr.read().decode()
                
                # 簡單檢查本地目錄是否有東西
                if not any(os.scandir(instrument_temp_dir)):
                     print(f"  -> 找不到 {last_month_str} 月份的數據 (或遠端路徑錯誤)。")
                     os.rmdir(instrument_temp_dir)
                else:
                    # --- 在這裡執行合併邏輯 ---
                    print(f"  -> 下載完成，開始合併 CSV...")
                    merge_daily_files(instrument_temp_dir)
                    download_count += 1
                    
        except Exception as e:
            print(f"  -> 下載/處理發生錯誤: {e}")

    if download_count == 0:
        print("警告: 未下載任何數據。")
        shutil.rmtree(LOCAL_TEMP_DIR)
        return None

    # 5.重命名與打包
    print("\n--- 開始重命名 ---")
    for original_name, new_name in rename_map.items():
        original_path = os.path.join(LOCAL_TEMP_DIR, original_name)
        new_path = os.path.join(LOCAL_TEMP_DIR, new_name)
        if os.path.exists(original_path):
            os.rename(original_path, new_path)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    zip_filename_base = f"backup_{group_name}_{last_month_str}_{timestamp}"
    zip_filepath = shutil.make_archive(zip_filename_base, 'zip', LOCAL_TEMP_DIR)
    
    print(f"--- 打包完成: {zip_filepath} ---")
    shutil.rmtree(LOCAL_TEMP_DIR)
    return zip_filepath

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='根據指定的儀器組下載並打包上個月的備份數據。')
    parser.add_argument('group_name', type=str, help='要下載的儀器組名 (例如 "T8-WISE")')
    args = parser.parse_args()
    
    final_zip_file = download_by_group(args.group_name)
    
    if final_zip_file:
        with open(os.environ['GITHUB_OUTPUT'], 'a') as hf:
            print(f'zip_filename={final_zip_file}', file=hf)