# DragonBones 骨骼动画资产来源与许可

本目录存放「天天电宠」骨骼动画层的**预设骨架资产**（DragonBones 5.x JSON 格式）。
所有物种共用 `pixi.js` + `pixi-dragonbones-runtime` 渲染管线；
没有预设资产的物种（猪猪、AI 生成物种）由运行时程序化生成 DragonBones 骨架数据。

## 资产清单

| 目录 | 物种 | 骨骼数 | 动画 | 来源 | 许可 |
|------|------|--------|------|------|------|
| `cat/` | 猫咪 | 53 | 29 个（idle/eating/happy/sad/skating/jump/dance…） | [chimple/bahama](https://github.com/chimple/bahama) `assets/resources/prefabs/friend/cat/` | MPL-2.0 |
| `dog/` | 狗狗 | 53 | 29 个（与猫同族骨架） | [chimple/bahama](https://github.com/chimple/bahama) `assets/resources/prefabs/friend/dog/` | MPL-2.0 |
| `dino/` | 恐龙怪兽 | 19 | 4 个（stand/walk/jump/fall） | [DragonBones/DragonBonesJS](https://github.com/DragonBones/DragonBonesJS) `Hilo/Demos/resource/assets/dragon_boy` | MIT |

各资产目录内附对应许可证副本（`LICENSE.txt`）。

## 猪猪为什么没有预设资产？

全网（GitHub / itch.io / OpenGameArt / DragonBones 官方资源库）检索后未发现
**许可允许再分发** 的猪形 DragonBones 骨骼资产。因此猪猪（以及 AI 设计的所有新物种）
使用游戏内置的程序化骨架生成器（`src/games/tiantian-dianchong/db/skeletonFactory.js`）
在运行时直接产出 DragonBones 格式的骨架与动画数据——零外部资产文件，
且与领养预览中的 SVG 造型（`PetAvatar`）同源。

## 运行时

- [pixi.js](https://pixijs.com/)（MIT）
- [pixi-dragonbones-runtime](https://github.com/h1ve2/pixi-dragonbones-runtime)（MIT，
  内含 DragonBones 官方运行时代码，MIT © 2012-2018 The DragonBones team）

MPL-2.0 说明：cat/dog 资产以 MPL-2.0 许可随本仓库分发（本仓库整体为 Apache-2.0，
MPL 文件保持其原始许可证，见各目录 LICENSE.txt）。
