"""批量拉取第三批 articulation 报告（20 所 CC 扩展：新增 15 所 CCC）。

用法：
    cd scrapers && python3 batch_fetch_v3.py

抓取矩阵：15 所新增 CCC x 3 所 UC（UCB/UCLA/UCSD），专业关键词与前两批对齐
（computer science + business administration/psychology/biology/economics/data science），
学年 2026-2027（year_id=77）。结果存 data/raw/（gitignored），再跑
mobile/scripts/build-data.py 打包进 mobile/www/js/artic-gz-*.js。

学校 ID 均经 /api/institutions 实测确认（2026-10-16），见 assist.KNOWN_CCC_IDS。

合规：单进程、请求间隔 >= 2.5 秒、识别性 UA、只读公开报告页。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import batch_fetch_v2 as v2

# 15 所新增（含用户点名的 IVC、Foothill）
v2.CCCS = [
    "Irvine Valley College",
    "Foothill College",
    "Saddleback College",
    "Santa Barbara City College",
    "El Camino College",
    "Berkeley City College",
    "College of Alameda",
    "Laney College",
    "Merritt College",
    "College of San Mateo",
    "Canada College",
    "Skyline College",
    "Cypress College",
    "Fullerton College",
    "Golden West College",
]

MAJORS = ("computer science,business administration,"
          "psychology,biology,economics,data science")

if __name__ == "__main__":
    sys.exit(v2.main(["--majors", MAJORS]))
