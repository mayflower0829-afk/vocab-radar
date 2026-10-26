#!/usr/bin/env python3
"""从 ECDICT 全量词库提取考研词汇子集，生成 public/data.js（window.WORDS）。

筛选：tags 含 "ky"（ECDICT 的考研标记）；
排序：frq（COCA 词频，越小越常用）升序，无词频(0)的排后；
字段：word / phonetic / translation / frq / oxford / collins（只留展示所需，控制体积）。
用法：python3 tools/prepare_data.py [data/ecdict.csv]
"""
import csv
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
CSV_PATH = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "ecdict.csv"

rows = []
def _int(v):
    v = (v or "").strip()
    return int(v) if v.isdigit() else 0

with open(CSV_PATH, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for r in reader:
        tags = (r.get("tag") or "").lower()
        if "ky" not in tags.split():
            continue
        word = (r.get("word") or "").strip()
        if not word or " " in word:      # 只收单词，词组后续版本再考虑
            continue
        rows.append({
            "w": word,
            "p": (r.get("phonetic") or "").strip(),
            "t": (r.get("translation") or "").strip().replace("\\n", "；"),
            "frq": _int(r.get("frq")),
            "ox": 1 if (r.get("oxford") or "").strip() == "1" else 0,
            "cl": _int(r.get("collins")),
        })

# 去重（大小写归一，保留词频更高的那条）
seen = {}
for r in rows:
    k = r["w"].lower()
    if k not in seen or (r["frq"] or 99999) < (seen[k]["frq"] or 99999):
        seen[k] = r
words = sorted(seen.values(), key=lambda r: (r["frq"] == 0, r["frq"], r["w"]))

out = {"count": len(words), "updated": "2026-10-27", "source": "ECDICT (skywind3000/ECDICT, MIT)", "words": words}
dest = ROOT / "public" / "data.js"
dest.write_text(
    "/* 由 tools/prepare_data.py 生成：ECDICT 考研子集，词频(COCA)升序，勿手改 */\n"
    f"window.WORDS = {json.dumps(out, ensure_ascii=False, separators=(',', ':'))};\n",
    encoding="utf-8",
)
print(f"考研词汇 {len(words)} 条 → {dest}（{dest.stat().st_size / 1048576:.2f} MB）")
