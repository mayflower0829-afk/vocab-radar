# WordRadar · 考研词汇雷达

基于**艾宾浩斯记忆调度**与 **COCA 词频排序**的考研词汇学习工具。词库来自开源 ECDICT 的考研标记子集（约 5,000+ 词），纯前端实现，进度仅存本机。

**在线使用**：<https://cloud1-d4gsgj705497df85d-1501559031.tcloudbaseapp.com/vocab/>

## 功能

- **今日队列**：到期复习词（艾宾浩斯间隔 1/2/4/7/15/30 天）+ 按词频排序的新词，先复习后新学
- **三档自评**：认识（进入下一间隔）/ 模糊（2 天后重练）/ 不认识（重置并当日再见）——调度节奏由你的真实记忆状态驱动
- **测验模式**：四选一英译中，答错自动按"不认识"处理，与学习管线共用同一调度
- **词频排序**：按 COCA 当代美国英语语料库词频升序学习，先掌握真实语料中的高频词；标注牛津 3000 核心词与 Collins 星级
- **看板**：近 14 天新学/复习堆叠柱状图、词汇状态分布、连续打卡天数
- **数据自持**：localStorage 存储 + 一键 JSON 备份/恢复，无账号无后端

## 数据来源

词库提取自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT License）全量词库的考研标记子集，含音标、中文释义、COCA 词频、牛津/Collins 标记。提取脚本见 `tools/prepare_data.py`。

## 与「考研工具箱」的关系

本项目与 [math3-radar](https://github.com/mayflower0829-afk/math3-radar)（数学考频）、[mas-school-guide](https://github.com/mayflower0829-afk/mas-school-guide)（择校数据）同属一个考研工具箱：把备考中高频重复的决策与训练环节做成数据驱动的工具。

## 复现

```bash
# 词库重提取（需先下载 ECDICT 全量 csv 到 data/）
python3 tools/prepare_data.py
# 本地运行
cd public && python3 -m http.server 8082
```

## License

MIT
