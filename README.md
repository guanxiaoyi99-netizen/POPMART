# POPMART 数据分析仪表盘

基于真实公开数据的泡泡玛特(POP MART)热搜与评论分析仪表盘:Flask 后端 + ECharts 前端,覆盖微博/抖音/哔哩哔哩热搜趋势、B 站真实用户评论情感分析、IP 营收表现与消费者画像。

## 功能

仪表盘共 7 个页签:

| 页签 | 内容 |
| --- | --- |
| Overview | KPI 概览(微博真实热度、真实评论数、正面率、最热 IP)、IP 营收排行、情感分布、平台热搜占比 |
| IP Analysis | 各 IP 营收 vs 同比增速散点图、微博热度、IP 画像雷达图、表现热力图 |
| Sentiment | 按话题类别的正/负/中性分布、正负评论平均点赞对比、类别情感热力图 |
| Platforms | 微博/抖音/B 站热搜上榜次数与互动量对比、月度×平台热力图、评论活跃时段 |
| Users | 消费者画像:年龄、性别、年消费、购买频率、首次接触 IP、购买动机(Bernstein 调研) |
| Hot Search | 热搜热度时间线、月度上榜热力图、类别与平台分布 |
| Comments | 点赞 Top 10 真实评论、各 IP 情感对比 |

## 项目结构

```
POPMART/
├── backend/
│   ├── app.py                  # Flask 服务:托管前端 + 6 个 JSON API
│   └── scripts/
│       └── build_real_data.py  # 数据管道:抓取 → 解析 → B 站评论 → 情感 → 聚合 CSV
├── frontend/
│   ├── index.html              # 仪表盘页面(ECharts 5)
│   ├── main.js                 # 图表渲染与交互
│   └── style.css
└── data/
    ├── hotsearch_trending.csv      # 热搜趋势(2023-08-16 至今)
    ├── comments.csv                # B 站真实评论(含 snownlp 情感标签)
    ├── ip_performance.csv          # IP 营收与热度表现
    ├── platform_distribution.csv   # 平台分布
    ├── sentiment_analysis.csv      # 情感分析汇总
    ├── user_demographics.csv       # 用户画像
    └── data_sources.md             # 数据来源与估算口径详细说明
```

## 快速开始

```bash
# 1. 创建虚拟环境并安装依赖
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 2. 启动后端(端口 8000)
.venv/bin/python backend/app.py

# 3. 浏览器打开
open http://localhost:8000
```

前端通过以下 API 读取 `data/` 下的 CSV:

- `GET /api/hotsearch` · `/api/comments` · `/api/ip-performance`
- `GET /api/platform-distribution` · `/api/sentiment` · `/api/demographics` · `/api/meta`

## 数据来源

所有数据来自公开真实来源,详见 [data/data_sources.md](data/data_sources.md):

- **热搜**:微博热搜历史归档(ameizi/weibo-trending-hot-search)与多平台热搜归档(iiecho1/hot_searches_for_apps,含微博/抖音/B 站)
- **评论**:Bilibili 公开 Web API 采集的「泡泡玛特/Labubu/Molly 等」相关视频热门评论,情感标签由 snownlp 模型打分派生(≥0.6 正面 / ≤0.4 负面)
- **IP 营收**:泡泡玛特 2024 年度报告(HKEX 9992.HK):总营收 130.38 亿元(+106.9%),Labubu 30.41 亿(+726.6%)
- **用户画像**:Bernstein 消费者调研(2025,n=850)+ 年报会员/复购数据

> ⚠️ **口径说明**:部分字段无公开真实数据,按真实锚点估算补齐,CSV 中以 `note` / `volume_note` 列标注。微博热度值为平台实时算法值,跨时期不可直接比较;snownlp 情感为模型估计值,非人工标注。详见 data_sources.md 第 5 节。

## 重新生成数据

```bash
cd backend
../.venv/bin/python scripts/build_real_data.py                  # 完整流程
../.venv/bin/python scripts/build_real_data.py --days 60        # 冒烟测试(近 60 天)
../.venv/bin/python scripts/build_real_data.py --only fetch     # 只运行单个阶段
../.venv/bin/python scripts/build_real_data.py --videos 40 --comments 800  # 缩小 B 站抓取规模
```

流程:抓取热搜归档(可断点续传)→ 解析 → B 站评论抓取(带缓存)→ snownlp 情感打分 → 聚合写入 6 个 CSV(附校验)。运行前自动备份原 CSV 至 `data/backup_*/`。
