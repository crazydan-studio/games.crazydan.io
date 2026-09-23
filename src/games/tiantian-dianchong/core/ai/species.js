// ============ AI 物种设计器 ============
// 新增物种时调用 AI 模型确定其生命系统与行为模式：
// 输入「物种名 + 灵感描述」→ 按物种 Schema 生成完整定义 → clampSpecies 钳制。
// 每次调用按 species 类型入档审计库（完整提示词 + 模型输出 + 校验去向）。

import { createAiClient } from './provider.js'
import { annotateAudit, OUTCOMES } from './audit.js'
import { clampSpecies } from '../species.js'

const SCHEMA_PROMPT = `你是电子宠物游戏的物种设计师。根据用户给的物种名与灵感，设计一个可玩的电子宠物物种。

严格只输出 JSON，结构如下（全部字段必填）：
{
  "id": "小写英文与连字符，如 fire-fox",
  "name": "中文名（不超过 6 字）",
  "emoji": "一个代表性 emoji",
  "intro": "一句话介绍（不超过 40 字）",
  "personality": ["3 个性格标签，每个不超过 4 字"],
  "traits": {
    "metabolism": 0.2-3.0,      // 饥饿速率：越大越能吃
    "hygieneDecay": 0.2-3.0,    // 变脏速率
    "illnessRate": 0.2-3.0,     // 生病倾向
    "recovery": 0.2-3.0,        // 恢复力
    "growthSpeed": 0.2-3.0,     // 成长速度
    "moodVolatility": 0.2-3.0,  // 情绪波动：越大越容易闹脾气
    "sociability": 0.2-3.0,     // 陪伴需求
    "snackLove": 0.2-3.0,       // 零食喜好
    "bathMood": -10 到 10       // 洗澡后的心情变化：负数讨厌水，正数爱洗澡
  },
  "schedule": { "sleep": [[13, 16]] },  // 睡眠时段列表 [起始小时,结束小时)，0-24，可跨夜
  "behaviors": { "idle": 1, "wander": 1, "sleep": 1, "play": 1, "beg": 1, "groom": 1, "stare": 1 },  // 行为倾向权重 0-5
  "look": {
    "body": "#RRGGBB",   // 身体主色
    "belly": "#RRGGBB",  // 肚皮色（比主色浅）
    "accent": "#RRGGBB", // 点缀色
    "ear": "pointed|floppy|round|horn",   // 耳朵：尖耳/垂耳/圆耳/角
    "tail": "striped|wag|curly|spikes",   // 尾巴：条纹/摇摆/卷曲/刺尾
    "snout": "cat|dog|pig|dino",          // 鼻吻风格
    "extra": "whiskers|collar|tusks|back-spikes|none"  // 附加件：胡须/项圈/獠牙/背刺/无
  },
  "quips": ["6-8 句符合性格的口头禅，每句不超过 15 字"]
}
数值设计要求：性格设定要与数值自洽（如「贪吃」对应高 metabolism 与 snackLove）；配色和谐、适合可爱画风。`

/**
 * 生成物种（AI 确定生命系统与行为模式）
 * @returns {Promise<{ok: boolean, species?: object, raw?: any, error?: string}>}
 */
export async function generateSpeciesByAi({ name, idea }, cfg, fetchImpl = null) {
  const client = createAiClient(cfg, fetchImpl)

  const res = await client.chat({
    system: SCHEMA_PROMPT,
    user: `物种名：${String(name || '').trim()}\n灵感描述：${String(idea || '').trim() || '（自由发挥）'}`,
    json: true,
    temperature: 0.9,
    task: { type: 'species', tag: String(name || '').trim() }
  })
  if (!res.ok) {
    if (res.entryId) annotateAudit(res.entryId, { used: OUTCOMES.REJECTED, note: `请求失败：${res.error}` })
    return { ok: false, error: res.error }
  }
  if (!res.data || typeof res.data !== 'object') {
    if (res.entryId) annotateAudit(res.entryId, { used: OUTCOMES.REJECTED, note: '模型输出无法解析为物种定义' })
    return { ok: false, error: '模型输出无法解析为物种定义' }
  }

  // 用户给的名字优先于模型命名
  if (name && String(name).trim()) res.data.name = String(name).trim().slice(0, 12)
  const species = clampSpecies(res.data)
  if (!species) {
    if (res.entryId) annotateAudit(res.entryId, { used: OUTCOMES.REJECTED, note: '物种定义未通过 Schema 校验' })
    return { ok: false, error: '物种定义校验失败' }
  }
  if (res.entryId) {
    annotateAudit(res.entryId, { used: OUTCOMES.APPLIED, note: `物种「${species.name}」Schema 校验通过，数值已按范围钳制` })
  }
  return { ok: true, species, raw: res.data }
}
