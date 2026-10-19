# 天天消消乐

用猫咪「天天」的表情玩三消！拍下天天的各种表情，它们会**实时变成棋盘上的消除元素**。

本目录是 [games.crazydan.io](../../../) 仓库的一个**游戏模块**（`src/games/tiantian-xiaoxiaole/`），
与门户主模块同属一个 Vite 工程统一开发与构建，线上位于门户子目录 `/tiantian-xiaoxiaole/`。技术栈：**Vite + pnpm + Vue 3**，纯静态部署。

## 功能一览

| 功能 | 说明 |
| --- | --- |
| 经典闯关 | 基础 25 步内达到目标分即通关（第 10 关起有通关奖励步数加持），无限关卡，三星评价；当前关卡自动记录（localStorage），刷新页面后从这一关继续，不再从第 1 关重来，主页按钮同步显示「继续闯关 · 第 N 关」 |
| 通关奖励步数 | 从第 10 关开始，每通过一关，下一关初始剩余步数在基础 25 步上适当追加（每升一关 +2、封顶 +10，第 14 关起 35 步），提高可通关性、增强玩家信心；通关结算弹窗预告下一关奖励，进入下一关时 toast 明确提示（见下文「通关奖励步数」） |
| 隐藏彩蛋 | 从第 10 关开始，每关在随机格子里埋藏隐藏彩蛋：数量逐关递增（第 10 关 2 枚 → 每升一关 +1 枚 → 封顶 6 枚），分值逐关走高且单枚可达普通三连的 15~40 倍（450~1200 分）；消除扫到彩蛋格即当场开奖加分，提高可通过性、可玩性，用意外之喜呵护玩家信心（见下文「隐藏彩蛋」） |
| 连消奖励 | 连锁消除从第 2 波起每波额外奖励分，连消波数越多、本波消除分越多，奖励越高（见下文「计分规则」） |
| 特殊块奖励 | 炸弹猫/彩虹猫/双彩虹三档奖励分，单位奖励严格递增（15/格 < 40/格 < 50/格，见下文「计分规则」） |
| 限时挑战 | 60 秒内尽量多得分，本地记录最高分 |
| URL 锚点路由 | `#classic` / `#time` 直达对应模式，浏览器回退/前进在家屏与游戏屏间切换 |
| 提示 | 矩阵下方常驻「提示」按钮（点击后高亮一对可消除块，约 2.6 秒自动熄灭），始终可用；采取**最高分支优先**策略：把每个可行交换当作一条分支，用与实际计分同口径的估值选即时战果最高的一步（双彩虹 > 彩虹配同款大部队/炸弹 > 炸弹对 > 5 连/L/T > 4 连 > 3 连，规则实现于 `engine.js findBestMove`） |
| 游戏设置 | 主页可开关：自动提示（停顿 5 秒自动点亮最优一步，与「提示」按钮同用最高分支优先策略，默认禁用）、颜色角标（默认禁用）；棋盘矩阵可选小图标 8×8 / 大图标 6×8（缺省）/ 特大图标 6×6，下一局生效；「关卡进度」显示当前关卡，可确认后从第 1 关重新开始 |
| 炸弹猫（4 连） | 单线 4 连生成炸弹猫，消除时引爆 3×3，可连环引爆 |
| 彩虹猫（5 连/L 形） | 与任意相邻表情交换即清除全场同款；双彩虹交换清空全场 |
| PWA 离线可玩 | Service Worker 缓存应用壳，打开一次后断网随时可玩，可安装到桌面/主屏 |
| 拍摄天天表情 | 调用摄像头（默认后置、前后可切换，切换先释放再重开防摄像头占死），中心方形裁剪保存 |
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

## 计分规则

| 项 | 得分 |
| --- | --- |
| 普通匹配 | 每簇 `格数 × 10 +（格数 − 3）× 20`（3 连 30 / 4 连 60 / 5 连及以上 90+） |
| 连锁乘数 | 同一次交换引发的连锁（连消）中，第 N 波整波得分 × N |
| **连消奖励** | 第 2 波起每波额外加分：`30 ×（N − 1） + 本波基础分 × 25% ×（N − 1）`，连消波数越多、本波消除分越多，奖励越高（规则实现于 `engine.js comboBonusOf`，飘字「连消奖励 +N」） |
| **炸弹猫引爆** | `（60 + 15 × 波及格数）× 波次`——登场奖励随引爆战果递增，炸得越多赚得越多（`engine.js bombBonusOf`） |
| **被波及的彩虹猫** | 40 × 清除格数 × 波次（`engine.js rainbowBonusOf`） |
| **主动交换彩虹猫** | 40 × 清除格数；双彩虹（两枚交换清空全场）50 × 全场格数 |
| **隐藏彩蛋（第 10 关起）** | 单枚 `450 + 50×（关数 − 10） + 60×蛋序`，封顶 1200；固定分值不乘连消倍数（规则实现于 `engine.js eggValueOf`，触发时飘字「彩蛋 +N！」） |

连消奖励叠加在连锁乘数之上：例如一次交换引发 3 波连消、每波都是 3 连（基础 30 分），
总得分 = 30×1 +（30×2 + 38）+（30×3 + 75）= 293 分，
其中 113 分来自连消奖励。长连锁的收益远高于同等数量的一次性消除，
制造连消是拿高分与快速通关的核心技巧。特殊块（炸弹/彩虹）的触发分不参与奖励基数，
它们自身已享受 × 波次乘数。炸弹/彩虹/双彩虹按稀有度与威力分三档奖励，
单位奖励严格递增：炸弹 15/格 < 彩虹 40/格 < 双彩虹 50/格——
同等战果下彩虹的回报明显高于炸弹，威力与稀有度越高、清除规模越大，奖励越高。

### 通关奖励步数

关卡目标分随关数线性上涨（每关 +600），第 10 关起（目标 6200 分）对休闲玩家
构成第一道坎。为提高可通关性、增强玩家信心：**从第 10 关开始，每通过一关，
下一关的初始剩余步数在基础 25 步之上适当追加**——每升一关 +2 步，封顶 +10 步
（规则实现于 `engine.js movesBonusOf`，基础步数由 `useGame.js movesFor` 叠加）：

| 关卡 | 初始剩余步数 | 通关奖励 |
| --- | --- | --- |
| 第 1 ~ 9 关 | 25 | — |
| 第 10 关 | 27 | +2 |
| 第 11 关 | 29 | +4 |
| 第 12 关 | 31 | +6 |
| 第 13 关 | 33 | +8 |
| 第 14 关及以后 | 35 | +10（封顶） |

封顶 +10 保证奖励「适当」：关卡目标分持续上涨，后期不会因步数无限增长而
失去挑战性；重开本关、通关进入下一关、刷新后续关均按同一口径计算，
奖励不丢失也不重复叠加。

奖励全链路可感知：通关结算弹窗以高亮胶囊行预告「下一关起始 N 步（含奖励 +M 步）」，
点击「下一关」后 toast 再次提示（`useGame.js nextLevel`）；第 9 关及以前通关无此提示，
奖励从第 10 关开始才登场。

### 隐藏彩蛋

在通关奖励步数之外，第 10 关起每关再埋一层「隐藏彩蛋」惊喜，提高可通过性、
可玩性，避免打击玩家自信心：开局把若干彩蛋埋在随机格子上，玩家看不见
也瞄不准，任何消除（含连消后续波次 / 炸弹波及 / 彩虹清场，双彩虹清空全场
即彩蛋大满贯）扫到彩蛋格，就当场开奖加分并飘字报喜。

每通过一关，下一关的彩蛋都不一样（规则实现于 `engine.js eggCountOf / eggValueOf /
planEasterEggs`）：

| 关卡 | 彩蛋数量 | 单枚分值 | 彩蛋总分 |
| --- | --- | --- | --- |
| 第 1 ~ 9 关 | 0 | — | — |
| 第 10 关 | 2 | 450 / 510 | 960 |
| 第 11 关 | 3 | 500 / 560 / 620 | 1680 |
| 第 12 关 | 4 | 550 ~ 730 | 2560 |
| 第 13 关 | 5 | 600 ~ 840 | 3600 |
| 第 14 关及以后 | 6（封顶） | 650 ~ 950 起，随关数继续走高 | 最高 7200（单枚封顶 1200） |

设计要点：

- **数量与分值双阶梯**：数量每升一关 +1 枚至封顶 6 枚；单枚分值随关数 +50、
  同关内蛋序每靠后一枚 +60，单枚封顶 1200——单枚就是普通三连（30 分）的
  15~40 倍，属「较大分值」；
- **惊喜而非技巧**：彩蛋位置对玩家不可见，扫到即中，属于意外之喜而非
  可规划的收益；因此彩蛋分为固定值、不乘连消波次倍数，惊喜不随连锁膨胀；
- **上限可控**：每关彩蛋总分始终低于该关目标分（如第 10 关彩蛋总分 960 vs
  目标 6200），彩蛋是重要助攻而非直接送通关；
- **同口径不丢失**：重开本关重新埋蛋（随机新位置），通关进入下一关按新
  关卡阶梯埋蛋；限时模式无关卡概念、不埋蛋；
- **可感知**：扫到彩蛋格当场飘字「彩蛋 +N！」报喜，加分即时可见。

## 快速开始

```bash
# 在仓库根目录安装依赖（门户与所有游戏共享一份 node_modules）
pnpm install

# 本地开发（统一 dev server，摄像头在 localhost 下可用）
#   门户 http://localhost:5173/ ，本游戏 http://localhost:5173/tiantian-xiaoxiaole/
pnpm dev                      # 在仓库根执行

# 引擎单元测试（纯逻辑，103 项断言，含 6×8 非方阵棋盘、关卡进度持久化、连消奖励分、特殊块三档奖励分、通关奖励步数、隐藏彩蛋（数量/分值阶梯/埋放规划）与提示最高分支优先用例）
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
| 游戏设置 | localStorage `ttxsl-settings-v1` | 提示/角标/矩阵，见 `store/settings.js` |
| 限时模式最高分 | localStorage `ttxsl-best` | |
| 经典闯关当前关卡 | localStorage `ttxsl-level` | 通关推进时写入，刷新后从这一关继续，见 `store/progress.js`；主页设置里可清零重来 |
| 静音开关 | localStorage `ttxsl-muted` | |
| 特殊块教学提示标记 | localStorage `ttxsl-seen-bomb/rainbow` | 仅首次弹 toast |
| 应用壳静态资源 | CacheStorage `ttxsl-cache-v2` | PWA 离线可玩 |
| 宿主环境 HUD 隐藏 | localStorage `nl-hud:public:v1` | 入口页加载前写入 `hidden`（若宿主注入悬浮工具条则隐藏） |

清理数据：浏览器设置里清除站点数据即可。

## 目录结构

游戏模块自成一体：入口页与源码同位于 `src/games/tiantian-xiaoxiaole/`，静态资源与脚本位于仓库根对应位置：

```
├── public/tiantian-xiaoxiaole/
│   ├── favicon.svg
│   ├── manifest.webmanifest  # PWA 清单
│   ├── sw.js                 # Service Worker（离线缓存策略）
│   ├── icons/                # PWA 图标（192/512/maskable PNG）
│   └── expressions/          # 示例表情包（静态资源部署契约）
├── scripts/                  # 以下脚本位于仓库根 scripts/ 目录
│   ├── gen-sample-pack.mjs   # 生成示例表情包
│   └── test-engine.mjs       # 引擎单元测试（103 项断言）
└── src/games/tiantian-xiaoxiaole/
    ├── index.html            # 入口页（manifest + apple-touch-icon meta；加载前写入 nl-hud 键；线上 /tiantian-xiaoxiaole/，由 gamePages 插件映射）
    ├── main.js / App.vue     # 应用壳：#classic/#time 锚点路由 + SW 注册 + 缓存补热
    ├── README.md             # 本说明
    ├── style.css             # 设计系统（暖色猫咪主题）
    ├── game/
    │   ├── engine.js         # 消消乐纯逻辑引擎（任意行列矩阵：匹配簇/特殊块/连锁/死局/连消奖励分与特殊块三档奖励分/提示最高分支优先估值/隐藏彩蛋埋放与分值阶梯）
    │   └── useGame.js        # 状态机（动画时序/特殊块激活/计分与连消奖励/隐藏彩蛋触发/关卡/限时）
    ├── store/
    │   ├── expressions.js    # 表情库 + 槽位（IndexedDB 持久化）
    │   ├── settings.js       # 游戏设置（提示/角标/矩阵大小，localStorage 持久化）
    │   ├── progress.js       # 关卡进度（localStorage 持久化，刷新续关）
    │   ├── pwa.js            # PWA 状态（离线徽章/安装提示）
    │   └── ui.js             # 全局 UI 状态（弹窗暂停计时）
    ├── utils/
    │   ├── db.js             # IndexedDB 封装
    │   ├── pack.js           # zip 导出/导入/服务器加载
    │   ├── catface.js        # 6+1 款手绘 SVG 猫咪表情（含彩虹猫）
    │   ├── sound.js          # WebAudio 合成音效
    │   └── toast.js          # 全局提示
    └── components/
        ├── HomeScreen.vue    # 主页（特殊元素图例 + PWA 徽章 + 游戏设置弹窗）
        ├── GameScreen.vue    # 游戏 HUD + 结算
        ├── GameBoard.vue     # 棋盘渲染 + 手势 + 特殊块动画（动态行列）
        ├── CameraModal.vue   # 摄像头拍摄
        ├── ExpressionManager.vue  # 表情管理/导入导出
        └── Icon/Modal/Toasts/CatFace  # 基础组件
```

## 浏览器兼容

Chrome / Edge / Safari / Firefox 现代版本（需支持 IndexedDB、pointer events、Service Worker）。
摄像头拍摄与 PWA 安装需 HTTPS 或 localhost；其余功能纯静态可用。

## 协议

代码遵循仓库根目录的 [Apache-2.0](../../../LICENSE) 协议。
