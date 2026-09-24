# 天天电宠 · 3D 资产来源与许可说明

「天天电宠」Babylon.js 3D 版使用的全部模型资产来自两位 CC0 素材作者，
许可均为 **Creative Commons Zero（CC0 1.0，公有领域贡献）**，
可自由用于个人与商业项目，无需署名（但我们仍在此致谢）。

## Quaternius（https://quaternius.com / https://quaternius.itch.io）

| 用途 | 模型 | 来源包 |
| --- | --- | --- |
| 宠物「小狐狸」（猫位物种） | Fox.glb | Ultimate Animated Animals |
| 宠物「柴犬」（狗位物种） | ShibaInu.glb | Ultimate Animated Animals |
| 宠物「霸王龙」（恐龙位物种） | Trex.glb | Animated LowPoly Dinosaurs |
| 宠物「猪猪」 | Pig.glb | Farm Animals Animated |
| 场景树木/灌木/草/岩石 | Tree/Bush/Grass/Rock | Ultimate Nature Pack（Simple Nature） |
| 投掷玩具骨头 / 鸡腿 | Bone / ChickenLeg | RPG Items Pack |
| 客厅窗户 | Window | Ultimate Home Interior |

## Kay Lousberg / KayKit（https://kaylousberg.com / https://kaylousberg.itch.io）

| 用途 | 模型 | 来源包 |
| --- | --- | --- |
| 床/沙发/桌椅/地毯/落地灯/书架/相框/书/仙人掌 | bed/couch/table/chair/rug/lamp/shelf 等 | KayKit Furniture Bits 1.0 |
| 食盆/汉堡/胡萝卜/芝士/炖菜/盘子 | bowl/burger/carrot/cheese/stew/plate | KayKit Restaurant Bits 1.0 |

详细许可文本见同目录：
- `LICENSE-Quaternius.txt`
- `LICENSE-KayKit-FurnitureBits.txt`
- `LICENSE-KayKit-RestaurantBits.txt`

## 猪（Pig）动画说明

Farm Animals Animated 包的猪仅含 Idle / Jump 两段骨骼动画，
「进食 / 睡觉 / 难过」等行为由 3D 播放器以姿态变换（躺卧旋转、播放速率、
明暗与位移抖动）程序化弥补——与此前 2D 版对程序化猪的做法一致。

## 获取管道备注

资产于 2026-09 经以下通道获取（poly.pizza 与 Google Drive 直链当时被
Cloudflare / 配额拦截）：itch.io 「No thanks, just take me to the downloads」
免费通道、GitHub 公开镜像仓库（trebeljahr/quaternius-showcase 的 GLB 转换、
beep2bleep/FreeAssetsByKenneyNLandQuaternius 的原始 FBX），FBX 用
FBX2glTF 0.9.7 本地转换为 GLB，KayKit 的 .gltf+.bin 多文件用自写脚本
打包为单文件 GLB。原始发布渠道与许可以上表为准。
