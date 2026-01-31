import os
import glob
import pandas as pd

# 取得批次檔所在資料夾
script_dir = os.path.dirname(os.path.abspath(__file__))

# 取得同一層的所有資料夾
folders = [f for f in os.listdir(script_dir) if os.path.isdir(os.path.join(script_dir, f))]

if not folders:
    print("⚠ 沒有找到任何資料夾")
    input("請按 Enter 結束...")
    exit()

print("=================================")
print(f"🔍 找到 {len(folders)} 個資料夾")
print("=================================\n")

# 遍歷每個資料夾
for folder_idx, folder_name in enumerate(folders):
    folder_path = os.path.join(script_dir, folder_name)
    output_csv = os.path.join(folder_path, "4010.csv")
    
    print(f"📁 [{folder_idx + 1}/{len(folders)}] 處理資料夾: {folder_name}", end=" ... ", flush=True)
    
    # 搜尋該資料夾內的所有 CSV 檔案
    csv_files = [f for f in glob.glob(os.path.join(folder_path, "**", "*.csv"), recursive=True) 
                 if os.path.abspath(f) != output_csv]
    
    if not csv_files:
        print(f"⚠ 無 CSV 檔案")
        continue
    
    # 合併 CSV（靜默處理）
    merged_df = pd.DataFrame()
    success_count = 0
    fail_count = 0
    
    for file in csv_files:
        try:
            df = pd.read_csv(file, encoding="utf-8-sig", sep=",", engine="python")
            if not df.empty:
                merged_df = pd.concat([merged_df, df], ignore_index=True)
                success_count += 1
            else:
                fail_count += 1
        except Exception:
            fail_count += 1
    
    # 儲存合併結果
    if not merged_df.empty:
        merged_df.to_csv(output_csv, index=False, encoding="utf-8-sig")
        print(f"✅ 合併 {success_count}/{len(csv_files)} 個檔案", end="")
        if fail_count > 0:
            print(f" (失敗: {fail_count})")
        else:
            print()
    else:
        print(f"⚠ 無有效資料")

print("\n=================================")
print("✅ 所有資料夾處理完成！")
print("=================================\n")
input("請按 Enter 結束...")