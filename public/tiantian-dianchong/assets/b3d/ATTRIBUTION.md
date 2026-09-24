# 天天电宠 · 3D 资产来源与许可说明

「天天电宠」Babylon.js 3D 版使用的全部模型资产来自两位 CC0 素材作者，
许可均为 **Creative Commons Zero（CC0 1.0，公有领域贡献）**，
可自由用于个人与商业项目，无需署名（但我们仍在此致谢）。

## Quaternius（https://quaternius.com / https://quaternius.itch.io）

| 用途 | 模型 | 来源包 |
| --- | --- | --- |
| 宠物「小狐狸」（猫位物种） | Fox.glb | Ultimate Animated Animals |
| 宠物「柴犬」（狗位物种） | ShibaInu.glb | Ultimate Animated Animals |
| 宠物「羊驼」 | Alpaca.glb | Ultimate Animated Animals |
| 怪兽「小飞龙」（恐龙位物种） | Dragon.glb | Ultimate Monsters |
| 场景树木/灌木/草/岩石 | Tree/Bush/Grass/Rock | Ultimate Nature Pack（Simple Nature） |
| 投掷玩具骨头 / 鸡腿 | Bone / ChickenLeg | RPG Items Pack |

## Kay Lousberg / KayKit（https://kaylousberg.com / https://kaylousberg.itch.io）

| 用途 | 模型 | 来源包 |
| --- | --- | --- |
| 室内场景全套（餐桌/餐椅/凳子/料理台/灶台/冰箱/菜单牌/食材箱/厨房地砖/墙窗） | table_round/chair/stool/kitchencounter/stove/fridge/menu/crate/floor_kitchen/wall_window_open | KayKit Restaurant Bits 1.0 |
| 食盆/汉堡/胡萝卜/芝士 | bowl/burger/carrot/cheese | KayKit Restaurant Bits 1.0 |

详细许可文本见同目录：
- `LICENSE-Quaternius.txt`
- `LICENSE-KayKit-RestaurantBits.txt`

## 动画词汇说明

- **Ultimate Animated Animals** 含两种骨架代际：Fox/ShibaInu 为 12 段词汇
  （Attack / Idle_2_HeadLow / Jump_ToIdle…）；Alpaca 为 13 段词汇
  （Attack_Headbutt / Attack_Kick / Idle_Headlow / Jump_toIdle…），
  分别按 `uaa` / `uaa2` 家族映射。
- **Ultimate Monsters** 的小飞龙含 8 段词汇（Death / Fast_Flying / Flying_Idle /
  Headbutt / HitReact / No / Punch / Yes），其中 Yes/No（点头/摇头）
  直接语义映射「开心/难过/喂药」。
- 无睡姿动画的模型由 3D 播放器以姿态变换（躺卧旋转、播放速率、明暗与
  位移抖动）程序化弥补。

## 获取管道备注

资产于 2026-09 经以下通道获取（poly.pizza 与 Google Drive 直链当时被
Cloudflare / 配额拦截）：itch.io 「No thanks, just take me to the downloads」
免费通道（KayKit Restaurant Bits 1.0 FREE 原始 zip）、GitHub 公开镜像仓库
（trebeljahr/quaternius-showcase 的 GLB 转换）、Quaternius 官网 Google Drive
分享文件夹（Ultimate Monsters 的 Dragon.gltf，自包含 data-URI 打包为 GLB）、
FBX 用 FBX2glTF 0.9.7 本地转换，KayKit 的 .gltf+.bin 多文件用自写脚本
打包为单文件 GLB。原始发布渠道与许可以上表为准。
