import os
import sqlite3
import subprocess
import time
import csv
import json

def run_cmd(cmd):
    try:
        print(f"Running: {cmd}")
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            return True, result.stdout
        else:
            print(f"Failed with exit code {result.returncode}")
            return False, result.stderr
    except Exception as e:
        print(f"Exception: {e}")
        return False, str(e)

def download_data():
    os.makedirs("/tmp/ai_prompts", exist_ok=True)
    
    urls = [
        # MagicPrompt Train
        ("magic_prompt.csv", [
            "curl -LL -o /tmp/ai_prompts/magic_prompt.csv https://mirror.ghproxy.com/https://huggingface.co/datasets/Gustavosta/MagicPrompt-Stable-Diffusion/raw/main/train.csv",
            "wget -qO /tmp/ai_prompts/magic_prompt.csv https://hf-mirror.com/datasets/Gustavosta/MagicPrompt-Stable-Diffusion/raw/main/train.csv",
            "curl -sSL -o /tmp/ai_prompts/magic_prompt.csv https://raw.gitmirror.com/Gustavosta/MagicPrompt-Stable-Diffusion/main/train.csv"
        ]),
        # Danbooru Tags
        ("danbooru.csv", [
            "curl -LL -o /tmp/ai_prompts/danbooru.csv https://mirror.ghproxy.com/https://raw.githubusercontent.com/DominikDoom/a1111-sd-webui-tagcomplete/main/tags/danbooru.csv",
            "wget -qO /tmp/ai_prompts/danbooru.csv https://raw.gitmirror.com/DominikDoom/a1111-sd-webui-tagcomplete/main/tags/danbooru.csv",
            "curl -sSL -o /tmp/ai_prompts/danbooru.csv https://fastly.jsdelivr.net/gh/DominikDoom/a1111-sd-webui-tagcomplete@main/tags/danbooru.csv"
        ]),
        # Midjourney Prompts (A smaller subset if available, or just fallback to SDXL local cache)
    ]
    
    success_files = []
    
    for filename, commands in urls:
        print(f"\n--- Attempting to download {filename} ---")
        filepath = f"/tmp/ai_prompts/{filename}"
        if os.path.exists(filepath) and os.path.getsize(filepath) > 1000:
            print(f"{filename} already exists. Skipping download.")
            success_files.append(filepath)
            continue
            
        success = False
        for cmd in commands:
            ok, output = run_cmd(cmd)
            if ok and os.path.exists(filepath) and os.path.getsize(filepath) > 1000:
                print(f"✅ Success using: {cmd}")
                success = True
                success_files.append(filepath)
                break
            else:
                print("Method failed, trying next...")
                time.sleep(1)
                
        if not success:
            print(f"❌ All download methods failed for {filename}")

    return success_files

def parse_and_load(success_files):
    db_path = "/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut-sidecar/director_engine/tools/prompt_massive_dict.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Use the locally cached SDXL 750 styles file from Agent Tools as well
    local_sdxl = "/Users/sunwuyuan/.cursor/projects/Users-sunwuyuan-Desktop-01-nextapi-v3/agent-tools/666a6d35-12e2-45f7-a2f4-ccce5f026736.txt"
    if os.path.exists(local_sdxl):
        success_files.append(local_sdxl)

    for filepath in success_files:
        print(f"\nProcessing {filepath} into database...")
        filename = os.path.basename(filepath)
        
        if "danbooru.csv" in filename:
            batch = []
            count = 0
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    parts = line.strip().split(',')
                    if len(parts) >= 1:
                        tag = parts[0]
                        category = "danbooru_general"
                        if len(parts) > 1:
                            cat_map = {"0": "general", "1": "artist", "3": "copyright", "4": "character"}
                            category = cat_map.get(parts[1], "danbooru_other")
                        batch.append((tag, category, 10))
                        count += 1
                        if len(batch) > 10000:
                            cursor.executemany("INSERT INTO tags (tag, category, weight) VALUES (?, ?, ?)", batch)
                            conn.commit()
                            batch = []
            if batch:
                cursor.executemany("INSERT INTO tags (tag, category, weight) VALUES (?, ?, ?)", batch)
                conn.commit()
            print(f"Loaded {count} tags from {filename}")

        elif "magic_prompt.csv" in filename:
            batch = []
            count = 0
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                next(f, None) # skip header
                for line in f:
                    prompt = line.strip().strip('"')
                    if prompt:
                        batch.append((prompt, "MagicPrompt-SD"))
                        count += 1
                        if len(batch) > 10000:
                            cursor.executemany("INSERT INTO prompts (prompt, source) VALUES (?, ?)", batch)
                            conn.commit()
                            batch = []
            if batch:
                cursor.executemany("INSERT INTO prompts (prompt, source) VALUES (?, ?)", batch)
                conn.commit()
            print(f"Loaded {count} prompts from {filename}")
            
        elif "666a6d35" in filename:
            # Parse the SDXL styles text file
            batch = []
            count = 0
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    if line.startswith("Style:"):
                        try:
                            # E.g.: Style: Anime,"anime artwork {prompt} . anime style...","photo, deformed..."
                            # We'll just extract the positive prompt part
                            parts = line.split('","')
                            if len(parts) >= 2:
                                pos_prompt = parts[1].replace('{prompt}', '').strip(' ".,')
                                style_name = parts[0].replace('Style: ', '').strip(',"')
                                if pos_prompt:
                                    full_prompt = f"[{style_name}] {pos_prompt}"
                                    batch.append((full_prompt, "SDXL-750-Styles"))
                                    count += 1
                        except:
                            continue
            if batch:
                cursor.executemany("INSERT INTO prompts (prompt, source) VALUES (?, ?)", batch)
                conn.commit()
            print(f"Loaded {count} high-quality styles from SDXL-750 dataset")

    cursor.execute("SELECT COUNT(*) FROM prompts")
    p_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM tags")
    t_count = cursor.fetchone()[0]
    
    print("\n" + "="*50)
    print(f"FINAL DATABASE STATS:")
    print(f"Total Prompts: {p_count:,}")
    print(f"Total Tags: {t_count:,}")
    print("="*50)
    
    conn.close()

if __name__ == "__main__":
    files = download_data()
    parse_and_load(files)
