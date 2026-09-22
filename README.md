# games.crazydan.io · 小游戏合集

CrazyDan Studio 的网页小游戏合集仓库。**主模块（根目录）是游戏门户**，提供所有游戏的入口卡片，点击后跳转至对应的**游戏子模块目录**；每个游戏作为 [pnpm workspace](./pnpm-workspace.yaml) 的子包（子模块）独立构建与开发。

全仓基于 **Vite + pnpm + Vue** 技术栈，构建产物为**纯静态资源**，可整体部署至任意静态服务器。代码遵循 [Apache-2.0](./LICENSE) 协议。

## 仓库结构

```
.
├── index.html / src / vite.config.js     # 主模块：游戏门户（入口卡片列表）
├── games/
│   └── tiantian-xiaoxiaole/              # 游戏子模块：天天消消乐
│       ├── index.html / src / public/
│       └── package.json / vite.config.js # base './'，产物并入根 dist/games/<name>/
├── scripts/
│   └── build-all.mjs                     # 统一构建：门户 + 各游戏，合并输出 dist/
├── pnpm-workspace.yaml                   # 工作区声明：games/* 为子包
└── package.json                          # 主模块（门户）包定义
```

> 「子模块」指 pnpm workspace 下的子包：拥有独立的 `package.json`、Vite 配置与源码目录，可独立构建与部署；如未来需要拆分为独立 git 仓库，将目录整体迁出即可。

## 收录游戏

### [天天消消乐](./games/tiantian-xiaoxiaole/)（`games/tiantian-xiaoxiaole`）

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
pnpm install                    # 一次性安装主模块 + 所有游戏子模块依赖

pnpm dev                        # 启动主模块（门户）   http://localhost:5173
pnpm dev:game:tiantian          # 启动天天消消乐子模块 http://localhost:5174
```

开发态门户与游戏是两个独立 dev server，点击门户卡片会跳转到该游戏的 dev 地址（见 `src/App.vue` 中游戏注册表的 `devOrigin`）；生产构建后则跳转同域子目录 `./games/<name>/`。

## 构建与部署

```bash
pnpm build                      # 依次构建门户与所有游戏子模块，合并输出至 dist/
```

`dist/` 即纯静态产物，目录结构与线上路由一一对应：

| 路径 | 内容 |
| --- | --- |
| `dist/index.html` | 门户入口（游戏列表） |
| `dist/games/tiantian-xiaoxiaole/index.html` | 天天消消乐入口 |
| `dist/games/tiantian-xiaoxiaole/expressions/` | 示例表情包（静态资源部署演示） |

将 `dist/` 整体上传至任意静态服务器即可，例如 nginx：

```nginx
server {
    listen 80;
    server_name games.crazydan.io;
    root /var/www/games.crazydan.io/dist;
    index index.html;
}
```

也可以拆分部署：单独构建某个游戏（`pnpm --dir games/tiantian-xiaoxiaole build`）后，把 `dist/games/<name>/` 上传到任意子路径（各模块 `base: './'`，全部资源相对引用，天然支持子路径部署）。

### 表情静态资源部署（线下服务器）

游戏导出的表情包内含 `manifest.json` 清单与 `images/` 图片目录。将解压后的目录整体上传至服务端（需允许 CORS 跨域访问），在游戏「表情管理 → 从服务器导入」中填入 `manifest.json` 的完整地址即可导入。`games/tiantian-xiaoxiaole/public/expressions/` 内置了一个示例包可直接试用。

## 新增游戏子模块

1. 在 `games/` 下新建目录（如 `games/my-game/`），参考 `games/tiantian-xiaoxiaole` 编写独立的 `package.json` 与 Vite 配置（`base: './'`，`build.outDir: '../../dist/games/my-game'`）；
2. 在门户 `src/App.vue` 的游戏注册表中添加入口卡片（`path` 指向 `./games/my-game/`）；
3. 执行 `pnpm install && pnpm build` —— `scripts/build-all.mjs` 会自动发现并构建新游戏。

## 测试

```bash
pnpm test                       # 运行各子模块测试（天天消消乐：三消引擎 19 项断言）
```

## 协议

本项目代码遵循 [Apache License 2.0](./LICENSE)。
