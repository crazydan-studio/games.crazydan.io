# 天天消消乐

用猫咪「天天」的表情玩三消！拍下天天的各种表情，它们会**实时变成棋盘上的消除元素**。

本目录是 [games.crazydan.io](../../../) 仓库的一个**游戏模块**（`src/games/tiantian-xiaoxiaole/`），
与门户主模块同属一个 Vite 工程统一开发与构建，线上位于门户子目录 `/tiantian-xiaoxiaole/`。技术栈：**Vite + pnpm + Vue 3**，纯静态部署。

## 功能一览

| 功能 | 说明 |
| --- | --- |
| 经典闯关 | 8×8 棋盘，25 步内达到目标分即通关，无限关卡，三星评价 |
| 限时挑战 | 60 秒内尽量多得分，本地记录最高分 |
| 炸弹猫（4 连） | 单线 4 连生成炸弹猫，消除时引爆 3×3，可连环引爆 |
| 彩虹猫（5 连/L 形） | 与任意相邻表情交换即清除全场同款；双彩虹交换清空全场 |
| PWA 离线可玩 | Service Worker 缓存应用壳，打开一次后断网随时可玩，可安装到桌面/主屏 |
| 拍摄天天表情 | 调用摄像头（前置/后置可切换），中心方形裁剪保存 |
| 浏览器持久化 | 表情存 IndexedDB，槽位存 localStorage，刷新不丢 |
| 实时上棋盘 | 保存的表情自动占用空元素槽位，棋盘立即换脸 |
| 打包导出 | 一键导出 zip（含 manifest.json + 图片 + 部署说明），下载到手机 |
| 线下静态部署 | 解压上传到任意静态服务器的 `expressions/` 目录，游戏内通过 URL 导入 |
| 默认猫咪 | 6 款手绘 SVG 天天表情（开心/惊讶/犯困/调皮/生气/撒娇）+ 彩虹猫星眼表情兜底 |
| 合成音效 | WebAudio 零素材音效（含爆炸/彩虹琶音），可静音 |

## 特殊元素玩法

| 触发 | 诞生 | 效果 |
| --- | --- | --- |
| 单线正好 4 连 | 炸弹猫（在落子位诞生） | 被消除时引爆 3×3，波及的炸弹连环爆炸；两枚炸弹直接交换 → 双双引爆 |
| 单线 ≥5 连 或 L/T 交叉 ≥5 格 | 彩虹猫（在交叉点/落子位诞生） | 与任意相邻表情交换 → 清除全场同款（同款炸弹会连锁引爆）；两枚彩虹猫交换 → 清空全场 |

炸弹猫保留原表情类型，可继续参与普通匹配；彩虹猫不参与匹配，
被爆炸波及时会随机清除一种表情（额外惊喜）。首次诞生会有教学提示，主页有常驻图例。

## 快速开始

```bash
# 在仓库根目录安装依赖（门户与所有游戏共享一份 node_modules）
pnpm install

# 本地开发（统一 dev server，摄像头在 localhost 下可用）
#   门户 http://localhost:5173/ ，本游戏 http://localhost:5173/tiantian-xiaoxiaole/
pnpm dev                      # 在仓库根执行

# 引擎单元测试（纯逻辑，19 项断言）
pnpm test

# 重新生成示例表情包静态资源（可选，仓库已含产物）
pnpm gen:pack

# 生产构建 → 统一输出至仓库根 dist/（本游戏位于 dist/tiantian-xiaoxiaole/）
pnpm build

# 本地预览构建产物
pnpm preview
```

## 静态部署

`pnpm build`（在仓库根执行）产出的 `dist/tiantian-xiaoxiaole/` 是**纯静态站点**，
全部资源使用 `base: './'` 相对引用，可部署到任意目录/子路径，不需要 Node 运行时。
`sw.js` / `manifest.webmanifest` / `icons/` 随构建一并产出，部署后即是完整的 PWA。

单独部署本游戏时（nginx 示例，子路径部署同样适用）：

```nginx
server {
    listen 443 ssl;
    server_name game.example.com;

    # SSL 证书（摄像头功能必须 HTTPS！）
    ssl_certificate     /etc/nginx/cert.pem;
    ssl_certificate_key /etc/nginx/cert.key;

    root /var/www/games.crazydan.io/dist/tiantian-xiaoxiaole;
    index index.html;

    # SPA 兜底
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

也可以部署到 OSS / CDN / GitHub Pages / Vercel 静态托管等任意静态服务。

> 注意 **PWA**：Service Worker 要求 HTTPS 或 localhost（与摄像头要求一致）。
> 若经反代（如 Nginx）部署，请确认 `sw.js`、`manifest.webmanifest` 以正确的
> `Content-Type` 返回且不被重定向劫持，其余无特殊配置。

> 注意 **摄像头**：浏览器安全策略要求 `getUserMedia` 只在 HTTPS 或 localhost 下可用。
> 部署到公网请务必配 HTTPS（上例已含），否则拍摄功能会提示不可用（游戏本身不受影响）。

## 表情包：从拍照到线下部署的完整闭环

```
手机/电脑打开游戏
   |
   |-- 拍摄天天表情 --> 存入浏览器 IndexedDB --> 实时变成棋盘元素
   |
   |-- 表情管理 → 导出表情包 --> 下载 zip 到手机
   |        （zip 内含 manifest.json + images/ + README.txt）
   |
   |-- 线下部署：解压 zip，把整个 expressions/ 上传到静态服务器
            |
            +-- 任意设备打开游戏 → 表情管理 → 从服务器导入
                 填入 https://你的域名/expressions/manifest.json
                 → 加载同一套天天表情，并应用元素槽位
```

### 表情包格式（部署契约）

```
expressions/
├── manifest.json
└── images/
    ├── tiantian-001.png
    ├── tiantian-002.svg
    └── ...
```

`manifest.json`：

```json
{
  "app": "tiantian-match",
  "name": "天天表情包",
  "version": 1,
  "items": [
    { "file": "images/tiantian-001.png", "name": "天天打哈欠" }
  ],
  "slots": ["images/tiantian-001.png", null, null, null, null, null]
}
```

- `items`：表情清单（图片支持 png/jpg/webp/svg/gif）
- `slots`：可选，长度 6，对应 6 个游戏元素槽位，值为其表情的 `file` 或 `null`（默认猫咪）

本游戏内置的示例包位于仓库根 `public/tiantian-xiaoxiaole/expressions/`（6 款手绘天天表情），
构建后会出现在 `dist/tiantian-xiaoxiaole/expressions/`，可用于验证「从服务器导入」链路。

## PWA 离线可玩

- `public/tiantian-xiaoxiaole/sw.js`（仓库根 public 下按游戏分目录）：Service Worker。导航请求**网络优先**（保证发版后拿到最新页面），
  静态资源**缓存优先**；首次访问时页面资源早于 SW 接管加载，注册完成后会
  自动「补热」缓存（重放本次加载的资源），实现**打开一次即可完全离线**。
- `public/tiantian-xiaoxiaole/manifest.webmanifest` + `public/tiantian-xiaoxiaole/icons/`：安装清单与图标（192/512/maskable），
  支持「添加到主屏幕 / 安装应用」，主页提供安装按钮与离线状态徽章。
- 开发模式下 `/src/`、`/@vite` 等路径永远走网络，不影响 HMR 热更新。
- 表情图片存 IndexedDB（blob 本地化），离线时棋盘照常换脸。

## 数据存储说明

| 数据 | 位置 | 说明 |
| --- | --- | --- |
| 表情图片（Blob） | IndexedDB `tiantian-xiaoxiaole/expressions` | 刷新/重启浏览器不丢 |
| 6 个元素槽位 | localStorage `ttxsl-slots-v1` | 指向表情 id |
| 限时模式最高分 | localStorage `ttxsl-best` | |
| 静音开关 | localStorage `ttxsl-muted` | |
| 特殊块教学提示标记 | localStorage `ttxsl-seen-bomb/rainbow` | 仅首次弹 toast |
| 应用壳静态资源 | CacheStorage `ttxsl-cache-v2` | PWA 离线可玩 |

清理数据：浏览器设置里清除站点数据即可。

## 目录结构

游戏源码位于 `src/games/tiantian-xiaoxiaole/`，入口页、静态资源与脚本位于仓库根对应位置：

```
├── tiantian-xiaoxiaole/
│   └── index.html            # 入口页（仓库根；manifest + apple-touch-icon meta）
├── public/tiantian-xiaoxiaole/
│   ├── favicon.svg
│   ├── manifest.webmanifest  # PWA 清单
│   ├── sw.js                 # Service Worker（离线缓存策略）
│   ├── icons/                # PWA 图标（192/512/maskable PNG）
│   └── expressions/          # 示例表情包（静态资源部署契约）
├── scripts/                  # 以下脚本位于仓库根 scripts/ 目录
│   ├── gen-sample-pack.mjs   # 生成示例表情包
│   └── test-engine.mjs       # 引擎单元测试（19 项断言）
└── src/games/tiantian-xiaoxiaole/
    ├── main.js / App.vue     # 应用壳：屏幕路由 + SW 注册 + 缓存补热
    ├── README.md             # 本说明
    ├── style.css             # 设计系统（暖色猫咪主题）
    ├── game/
    │   ├── engine.js         # 消消乐纯逻辑引擎（匹配簇/特殊块/连锁/死局）
    │   └── useGame.js        # 状态机（动画时序/特殊块激活/计分/关卡/限时）
    ├── store/
    │   ├── expressions.js    # 表情库 + 槽位（IndexedDB 持久化）
    │   ├── pwa.js            # PWA 状态（离线徽章/安装提示）
    │   └── ui.js             # 全局 UI 状态（弹窗暂停计时）
    ├── utils/
    │   ├── db.js             # IndexedDB 封装
    │   ├── pack.js           # zip 导出/导入/服务器加载
    │   ├── catface.js        # 6+1 款手绘 SVG 猫咪表情（含彩虹猫）
    │   ├── sound.js          # WebAudio 合成音效
    │   └── toast.js          # 全局提示
    └── components/
        ├── HomeScreen.vue    # 主页（特殊元素图例 + PWA 徽章）
        ├── GameScreen.vue    # 游戏 HUD + 结算
        ├── GameBoard.vue     # 棋盘渲染 + 手势 + 特殊块动画
        ├── CameraModal.vue   # 摄像头拍摄
        ├── ExpressionManager.vue  # 表情管理/导入导出
        └── Icon/Modal/Toasts/CatFace  # 基础组件
```

## 浏览器兼容

Chrome / Edge / Safari / Firefox 现代版本（需支持 IndexedDB、pointer events、Service Worker）。
摄像头拍摄与 PWA 安装需 HTTPS 或 localhost；其余功能纯静态可用。

## 协议

代码遵循仓库根目录的 [Apache-2.0](../../../LICENSE) 协议。
