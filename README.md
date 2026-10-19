# SWE-Marathon leaderboard replica

对 https://www.swe-marathon.org/ 的可部署前端快照复刻，采集于 2026-10-19。
保留原站布局、字体、图片、交互、v1.0/v1.1 榜单、任务详情、统计图表与运行轨迹页面。

## 本地运行

需要 Node.js 22 或更高版本，无需安装 npm 依赖。

```sh
npm run dev
```

打开 http://localhost:5173/ 。编辑数据或集成层后，重新启动此命令并刷新浏览器。

```sh
npm run build
npm run check
npm test
npm run preview
```

`dist/` 是构建产物，不提交到 Git；GitHub Actions 会重新生成。

## GitHub Pages

目标仓库：https://github.com/BigBigBai/swe-marathon-leaderboard

目标网址：https://bigbigbai.github.io/swe-marathon-leaderboard/

1. 将本项目提交到仓库的 `main` 分支。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 打开 **Actions → Deploy leaderboard to GitHub Pages** 查看运行结果。
4. 后续推送到 `main` 会自动校验、构建和部署。

如果更换仓库或绑定域名，更新 `src/site.config.json` 的 `publicUrl`。
资源使用相对路径，详情页使用原站 Hash 路由，支持 Pages 项目子目录及刷新。

## 内容与数据维护

| 路径 | 用途 |
| --- | --- |
| `src/site.config.json` | 浏览器标题、页面描述、公开网址、日志来源、联系邮箱、订阅地址 |
| `src/bootstrap.js` | 数据读取、资产路径适配、启动和加载失败处理 |
| `src/replica.css` | 额外样式；原站样式保持完整 |
| `data/v1.1/leaderboard.json` | 当前总榜，按显示顺序维护；`pass1` 使用 0–100 的百分数 |
| `data/v1.1/tasks.json` | 当前任务列表、分类及任务级成绩 |
| `data/v1.1/taskDetails.json` | 任务说明、环境、验证器、单任务榜单与精选轨迹 |
| `data/v1.1/trialById.json` | 运行详情页使用的运行记录索引 |
| `data/v1.1/metadata.json` | 首屏统计、类别、模型颜色、任务来源等 |
| `data/v1.0/` | 相同结构的历史归档 |
| `vendor/site/` | 未改动的上游构建文件、图标与图片 |
| `vendor/manifest.json` | 原始文件来源、大小与 SHA-256 校验值 |
| `scripts/build.mjs` | Pages 路径适配与订阅处理等构建补丁 |

更新成绩时，需要同时维护总榜、任务榜、运行索引和首屏统计；此版本没有重新运行评测、
自动计算排行榜或自动同步原站。统计分析页面中的图表数据仍保存在上游页面模块中。

为了忠实复刻，页面标题、简介、作者、论文、GitHub 链接及评测内容默认保留原站信息。
配置的 `title` 修改浏览器标题；页面内品牌、作者与文案仍来自快照。

## 轨迹、演示与订阅

- 运行轨迹 JSON 按需从 `trajectoryOrigin` 加载，默认使用原站；已验证该来源允许跨域请求。
  原站首屏标注的数百 GB 日志没有下载或包含在本仓库中。
- 原站本身未提供日志的运行仍保留原站的不可用状态，不生成虚构日志。
- 独立托管轨迹时，可将日志按 `trajectories/...` 目录放在 `vendor/site/`，
  并把 `trajectoryOrigin` 设为 `""`；也可以设置支持 CORS 的自有对象存储来源。
- 产品演示仍指向原站运行的外部服务，依赖它们的可用性。字体默认使用 Google Fonts。
- 订阅表单默认不发送任何信息。提交时提示未配置；将 `subscriptionEndpoint`
  配置为你自己的兼容 JSON 接口后启用，POST 内容为 `{email, interest: "news-events"}`。
- `contactEmail` 留空时保留原作者联系链接；填入自己的邮箱即可替换。

## 快照与许可

这是对公开网页构建产物的复刻，**不是上游未公开的 React/TypeScript 源码工程**。
页面渲染逻辑保留在上游模块中；数据与适配层已拆开供编辑。需要大幅改版时，建议逐步将
相关页面重写为独立组件，而不是直接编辑压缩文件。

上游网页署名为 Abundant AI，并标注 Apache 2.0。`vendor/UPSTREAM-LICENSE`
保留上游 GitHub 仓库的许可文本，`NOTICE.md` 记录来源和本项目改动。
原作者署名保留，页面底部增加独立复刻链接。品牌标识及外部资源不因本项目获得新的授权。

`python3 scripts/snapshot.py` 会补齐缺失的公开展示资源并更新校验清单，不下载轨迹归档。
`npm run export-data` 从固定上游模块重新导出数据，会覆盖本地 JSON 修改；日常维护无需执行。
更新上游版本时应先人工核对构建入口、模块名称和补丁标记，再更新脚本并验收。
