# games.crazydan.io · 小游戏合集

Crazydan Studio 的网页小游戏合集仓库。**主模块（门户）位于根目录**，提供所有游戏的入口卡片，点击后跳转至对应的**游戏子目录**；各游戏以 `src/games/<name>/` 源码子目录的形式与门户在**同一个工程内统一开发、统一构建**（单一 Vite 工程 + 单一 pnpm 包，多页面入口一次构建产出全站）。

全仓基于 **Vite + pnpm + Vue** 技术栈，构建产物为**纯静态资源**，可整体部署至任意静态服务器。代码遵循 [Apache-2.0](./LICENSE) 协议。

## 仓库结构

```
.
├── index.html                  # 主模块（门户）入口页 → src/portal/
├── src/
│   ├── portal/                 # 主模块：门户页面（入口卡片列表 + 游戏注册表）
│   └── games/
│       ├── tiantian-xiaoxiaole/    # 游戏：天天消消乐（入口页 index.html + 源码 + [模块说明](./src/games/tiantian-xiaoxiaole/README.md)）
│       └── tiantian-dianchong/     # 游戏：天天电宠（入口页 + 源码 + [详细设计文档](./src/games/tiantian-dianchong/README.md)）
├── public/
│   ├── favicon.svg             # 门户静态资源
│   ├── tiantian-xiaoxiaole/    # 天天消消乐静态资源（PWA 清单/图标/SW/示例表情包）
│   └── tiantian-dianchong/     # 天天电宠静态资源（PWA 清单/图标/SW）
├── scripts/                    # 测试与资源生成脚本（三消引擎单测、生命引擎单测、示例表情包）
├── vite.config.js              # 统一 Vite 配置（MPA 多入口，一次构建产出全站）
└── package.json                # 唯一的包定义（门户 + 所有游戏共享依赖）
```

> 游戏不再作为独立的 pnpm workspace 子包管理：每个游戏是一个自成一体的 `src/games/<name>/` 模块（入口页随源码同目录），静态资源放在 `public/<name>/`，在 `vite.config.js` 的 `GAME_ENTRIES` 中登记即可参与统一构建，门户与既有游戏共享依赖与构建管线，公共模块（如 Vue 运行时）自动拆分为共享 chunk。

## 收录游戏

### [天天消消乐](./src/games/tiantian-xiaoxiaole/)（`src/games/tiantian-xiaoxiaole`，线上 `/tiantian-xiaoxiaole/`）

以宠物猫「天天」的表情为主题的三消游戏：

- **三消玩法**：交换相邻元素 3 连消除，连击计分，关卡模式与限时模式；`#classic` / `#time` 锚点直达对应模式，浏览器回退/前进正常
- **游戏设置**：提示辅助（提示按钮 + 自动提示）与颜色角标可开关（均默认禁用）；棋盘矩阵可选小图标 8×8 / 大图标 6×8（缺省）/ 特大图标 6×6
- **特殊元素**：
  - 4 连生成**炸弹猫** —— 3×3 连环爆炸，可与相邻元素直接交换引爆
  - 5 连或 L/T 形交叉生成**彩虹猫** —— 与任意元素交换清除全场同款
  - 双彩虹交换清全场、炸弹对合爆、炸弹参与匹配即引爆等组合玩法
- **表情系统**：摄像头拍摄（默认后置、前后可切换）或相册导入天天表情 → 保存至浏览器（IndexedDB）→ 实时作为棋盘消除元素（6 个元素槽位）
- **表情包导入导出**：一键打包 `.zip` 下载，可存放至手机；解压后可作为静态资源部署到服务端，游戏内「从服务器导入」输入地址即回导入
- **PWA**：可安装到桌面/主屏，Service Worker 缓存应用外壳，**离线可玩**

### [天天电宠](./src/games/tiantian-dianchong/)（`src/games/tiantian-dianchong`，线上 `/tiantian-dianchong/`）

领养一只住在电波里的电子宠物（[详细设计文档](./src/games/tiantian-dianchong/README.md)）：

- **多物种养成**：猫、狗、猪、恐龙怪兽各有独立的生命系统与行为模式（饥饿速率 / 作息 / 情绪波动 / 恢复力等差异），可为宠物取名
- **生命模拟**：随时间成长、饥饿、生病、情绪变化；时间可与现实同步，也可 60×～3600× 加速；离线后回来会结算离开的时光
- **双生命系统**：内置**随机生命系统**（离线可玩）+ 可配置接入主流大模型的 **AI 智能体生命系统**（OpenAI 兼容接口，驱动宠物行为与心声，失败自动降级）
- **AI 物种设计器**：在领养页用 AI 生成全新物种（生命参数 + 行为模式 + 外形，经 Schema 钳制校验）
- **生死设定**：死亡可选且默认禁用（健康触底只会昏迷，照料即醒）；预留宠物间交互总线与多宠物 / 场景切换扩展点
- **场景**：内置客厅 / 草地 / 卧室 / 星空露台四个场景，预留 AI 动态生成场景
- **数据自主**：存档 JSON 一键导出 / 导入，支持备份、分享、跨设备同步；PWA **离线可玩**，可安装到主屏

## 环境要求

- Node.js ≥ 18（推荐 20+）
- pnpm ≥ 8（`npm i -g pnpm`）

## 本地开发

```bash
pnpm install    # 一次性安装全仓依赖（门户 + 所有游戏）

pnpm dev        # 统一 dev server：http://localhost:5173
```

门户与各游戏运行在**同一个 dev server** 上：门户位于 `/`，游戏位于 `/tiantian-xiaoxiaole/`、`/tiantian-dianchong/`（直接访问或从门户卡片点击进入均可）。开发态与生产构建后的路由行为完全一致，不再需要为每个游戏单独启动 dev server。

## 构建与部署

```bash
pnpm build      # 单次 MPA 构建：门户 + 所有游戏，统一输出至 dist/
```

`dist/` 即纯静态产物，目录结构与线上路由一一对应：

| 路径 | 内容 |
| --- | --- |
| `dist/index.html` | 门户入口（游戏列表） |
| `dist/tiantian-xiaoxiaole/index.html` | 天天消消乐入口 |
| `dist/tiantian-xiaoxiaole/expressions/` | 示例表情包（静态资源部署演示） |
| `dist/tiantian-dianchong/index.html` | 天天电宠入口 |

将 `dist/` 整体上传至任意静态服务器即可，例如 nginx：

```nginx
server {
    listen 80;
    server_name games.crazydan.io;
    root /var/www/games.crazydan.io/dist;
    index index.html;
}
```

> 全站使用 `base: './'` 相对引用，理论上也可整体部署到任意子路径（如 `https://example.com/games/`），但各游戏的 Service Worker 作用域与 manifest 均按其所在子目录解析，子路径部署时请一并验证 PWA 行为。

### 表情静态资源部署（线下服务器）

游戏导出的表情包内含 `manifest.json` 清单与 `images/` 图片目录。将解压后的目录整体上传至服务端（需允许 CORS 跨域访问），在游戏「表情管理 → 从服务器导入」中填入 `manifest.json` 的完整地址即可导入。`public/tiantian-xiaoxiaole/expressions/` 内置了一个示例包可直接试用。

## 新增游戏

1. 新建游戏模块目录 `src/games/my-game/`：入口页 `index.html`（`<script type="module" src="/src/games/my-game/main.js">`，页面内静态资源用相对路径引用）+ 入口 `main.js`、组件、逻辑等，可参考 `src/games/tiantian-xiaoxiaole/` 与其模块 README；
2. 游戏专属静态资源（favicon / PWA 清单与图标 / Service Worker 等）放入 `public/my-game/`，构建后与入口页同位于 `dist/my-game/`；
3. 在 `vite.config.js` 的 `GAME_ENTRIES` 中登记游戏名 `'my-game'`；
4. 在门户 `src/portal/App.vue` 的游戏注册表中添加入口卡片（`path: './my-game/'`）。

> 入口页的线上路由 `/my-game/` 与磁盘位置解耦，由 `vite.config.js` 内的 `gamePages()` 插件负责映射（开发态与构建态行为一致），无需在仓库根创建同名目录。

## 测试

```bash
pnpm test       # 天天消消乐：三消引擎 24 项断言；天天电宠：生命引擎 130 项断言
                # （纯逻辑，Node 直接运行，含非方阵棋盘与时间推进/生死开关/AI 降级等用例）
```

## 协议

本项目代码遵循 [Apache License 2.0](./LICENSE)。
