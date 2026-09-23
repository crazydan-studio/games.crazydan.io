// ============ AI 场景生成器（预留：动态生成新场景） ============
// 当前游戏仅内置几个场景；本模块为「新增场景由 AI 模型动态生成」预留：
// 输入「场景名 + 灵感」→ 场景 Schema JSON → clampScene 钳制 → 入本地场景库。

import { createAiClient } from './provider.js'
import { clampScene, PROP_TYPES } from '../scenes.js'

const SCHEMA_PROMPT = `你是电子宠物游戏的场景设计师。根据用户给的场景名与灵感，设计一个宠物生活场景。

严格只输出 JSON，结构如下（全部字段必填）：
{
  "id": "小写英文与连字符",
  "name": "中文名（不超过 6 字）",
  "sky": ["#RRGGBB", "#RRGGBB"],     // 天空渐变（上→下）
  "ground": ["#RRGGBB", "#RRGGBB"],  // 地面渐变（上→下）
  "groundY": 0.6-0.9,                // 地平线高度（0-1）
  "night": true 或 false,            // 是否夜景
  "props": [                          // 装饰件，最多 8 个
    { "type": "装饰件类型", "x": 0-1, "y": 0-1, "s": 0.5-1.5, "color": "#RRGGBB（可选）" }
  ]
}
可用的装饰件类型（只能从这里选）：${PROP_TYPES.join('、')}。
（cloud=云 tree=树 flower=花 butterfly=蝴蝶 moon=月亮 star=星星 cityline=城市剪影 fence=栅栏 ball=皮球 bowl=食盆 lamp=灯 window=窗户 rug=地毯 bed=小床 sofa=沙发）
设计要求：装饰件布局有留白、层次分明；夜空配 star/moon，客厅配 sofa/rug；配色和谐。`

/**
 * 生成场景
 * @returns {Promise<{ok: boolean, scene?: object, error?: string}>}
 */
export async function generateSceneByAi({ name, idea }, cfg, fetchImpl = null) {
  const client = createAiClient(cfg, fetchImpl)
  if (!client.ready) return { ok: false, error: 'AI 未配置（请在设置中完成 AI 智能体配置）' }

  const res = await client.chat({
    system: SCHEMA_PROMPT,
    user: `场景名：${String(name || '').trim()}\n灵感描述：${String(idea || '').trim() || '（自由发挥）'}`,
    json: true,
    temperature: 0.9
  })
  if (!res.ok) return { ok: false, error: res.error }
  if (!res.data || typeof res.data !== 'object') return { ok: false, error: '模型输出无法解析为场景定义' }

  if (name && String(name).trim()) res.data.name = String(name).trim().slice(0, 12)
  const scene = clampScene(res.data)
  if (!scene) return { ok: false, error: '场景定义校验失败' }
  if (!scene.props.length) return { ok: false, error: '模型没有给出有效的装饰件，请重试' }
  return { ok: true, scene }
}
