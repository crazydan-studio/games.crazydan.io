# games.crazydan.io · 小游戏合集

Crazydan Studio 的网页小游戏合集仓库。**主模块（门户）位于根目录**，提供所有游戏的入口卡片，点击后跳转至对应的**游戏子目录**；各游戏以 `src/games/<name>/` 源码子目录的形式与门户在**同一个工程内统一开发、统一构建**（单一 Vite 工程 + 单一 pnpm 包，多页面入口一次构建产出全站）。

全仓基于 **Vite + pnpm + Vue** 技术栈，构建产物为**纯静态资源**，可整体部署至任意静态服务器。代码遵循 [Apache-2.0](./LICENSE) 协议。

## 仓库结构

```
.
├── index.html                  # 主模块（门户）入口页 → src/portal/
├── tiantian-xiaoxiaole/
│   └── index.html              # 游戏入口页 → src/games/tiantian-xiaoxiaole/（线上即 /tiantian-xiaoxiaole/）
├── src/
│   ├── portal/                 # 主模块：门户页面（入口卡片列表 + 游戏注册表）
│   └── games/
│       └── tiantian-xiaoxiaole/    # 游戏：天天消消乐（源码 + [模块说明](./src/games/tiantian-xiaoxiaole/README.md)）
├── public/
│   ├── favicon.svg             # 门户静态资源
│   └── tiantian-xiaoxiaole/    # 游戏静态资源（PWA 清单/图标/SW/示例表情包）
├── scripts/                    # 测试与资源生成脚本（引擎单测、示例表情包、图标画布）
├── vite.config.js              # 统一 Vite 配置（MPA 多入口，一次构建产出全站）
└── package.json                # 唯一的包定义（门户 + 所有游戏共享依赖）
```

> 游戏不再作为独立的 pnpm workspace 子包管理：新增游戏只需新增 `src/games/<name>/` 源码目录、`<name>/index.html` 入口页并在 `vite.config.js` 的 `build.rollupOptions.input` 中登记即可，门户与既有游戏共享依赖与构建管线，公共模块（如 Vue 运行时）自动拆分为共享 chunk。

## 收录游戏

### [天天消消乐](./src/games/tiantian-xiaoxiaole/)（`src/games/tiantian-xiaoxiaole`，线上 `/tiantian-xiaoxiaole/`）

以宠物猫「天天」的表情为主题的三消游戏：

- **三消玩法**：交换相邻元素 3 连消除，连击计分，关卡模式与限时模式
- **特殊元素**：
  - 4 连生成**炸弹猫** —— 3×3 连环爆炸，可与相邻元素直接交换引爆
  - 5 连或 L/T 形交叉生成**彩虹猫** —— 与任意元素交换清除全场同款
  - 双彩虹交换清全场、炸弹对合爆、炸弹参与匹配即引爆等组合玩法
- **表情系统**：摄像头拍摄（前后摄切换、方裁剪）或相册导入天天表情 → 保存至浏览器（IndexedDB）→ 实时作为棋盘消除元素（6 个元素槽位）
- **表情包导入导出**：一键打包 `.zip` 下载，可存放至手机；解压后可作为静态资源部署到服务端，游戏内「从服务器导入」输入地址即回导入
- **PWA**：可安装到桌面/主屏，Service Worker 缓存应用外壳，**离线可玩**

## 环境要求

- Node.js ≥ 18（推荐 20+）
- pnpm ≥ 8（`npm i -g pnpm`）

## 本地开发

```bash
pnpm install    # 一次性安装全仓依赖（门户 + 所有游戏）

pnpm dev        # 统一 dev server：http://localhost:5173
```

门户与各游戏运行在**同一个 dev server** 上：门户位于 `/`，游戏位于 `/tiantian-xiaoxiaole/`（直接访问或从门户卡片点击进入均可）。开发态与生产构建后的路由行为完全一致，不再需要为每个游戏单独启动 dev server。

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

1. 新建源码目录 `src/games/my-game/`（入口 `main.js`、组件、逻辑等，可参考 `src/games/tiantian-xiaoxiaole/` 与其模块 README）；
2. 新建入口页 `my-game/index.html`，`<script type="module" src="/src/games/my-game/main.js">`，页面内静态资源用相对路径引用；
3. 在 `vite.config.js` 的 `build.rollupOptions.input` 中登记：`'my-game': r('./my-game/index.html')`；
4. 游戏专属静态资源（favicon / PWA 清单与图标 / Service Worker 等）放入 `public/my-game/`，构建后即位于 `dist/my-game/`；
5. 在门户 `src/portal/App.vue` 的游戏注册表中添加入口卡片（`path: './my-game/'`）。

## 测试

```bash
pnpm test       # 天天消消乐：三消引擎 19 项断言（纯逻辑，Node 直接运行）
```

## 协议

本项目代码遵循 [Apache License 2.0](./LICENSE)。
