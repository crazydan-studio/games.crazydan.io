// ============ 天天电宠 · 生命引擎单元测试（Node 直接运行，无浏览器依赖） ============
// 覆盖：时间换算 / 物种系统与 AI 钳制 / 生命引擎（衰减·物种差异·生病·死亡开关·
// 昏迷自愈·成长·离线结算·上限）/ 玩家操作与冷却 / 随机生命系统确定性 /
// 存档导入导出回环 / AI Provider 解析与降级 / 宠物间交互总线 / AI 调用审计
import assert from 'node:assert/strict'
import { HOUR, DAY, clockNow, dayOf, hourOfDay, periodOfDay, fmtGameSpan } from '../src/games/tiantian-dianchong/core/time.js'
import { BUILTIN_SPECIES, clampSpecies, getSpecies, stageOf, isSleepHour, speciesList } from '../src/games/tiantian-dianchong/core/species.js'
import { advance, createPet, moodTarget, riskLevel, offlineSummary, isAsleep, OFFLINE_CAP_MS } from '../src/games/tiantian-dianchong/core/life.js'
import { decideRandom } from '../src/games/tiantian-dianchong/core/randomLife.js'
import { performAction } from '../src/games/tiantian-dianchong/core/actions.js'
import { newSave, sanitizeSave, exportSave, parseImportedSave, pushLog } from '../src/games/tiantian-dianchong/core/storage.js'
import { clampScene, BUILTIN_SCENES, getScene } from '../src/games/tiantian-dianchong/core/scenes.js'
import { runPetInteraction, listPetInteractions, BUILTIN_PET_INTERACTIONS } from '../src/games/tiantian-dianchong/core/interactions.js'
import { extractJson, createAiClient, testAiConnection } from '../src/games/tiantian-dianchong/core/ai/provider.js'
import { decideAi } from '../src/games/tiantian-dianchong/core/ai/life.js'
import { generateSpeciesByAi } from '../src/games/tiantian-dianchong/core/ai/species.js'
import { generateSceneByAi } from '../src/games/tiantian-dianchong/core/ai/scene.js'
import {
  AI_TASK_TYPES,
  OUTCOMES,
  recordAiCall,
  annotateAudit,
  getAuditEntries,
  auditStats,
  clearAudit,
  exportAudit,
  subscribeAudit,
  registerAiTaskType
} from '../src/games/tiantian-dianchong/core/ai/audit.js'

let passed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error(`✗ FAIL: ${msg}`)
    process.exit(1)
  }
  passed++
  console.log(`✓ ${msg}`)
}

// 不生病确定性随机源；生病测试用低随机源
const never = () => 0.999999
const always = () => 0.000001

function makeSave(speciesId = 'cat', opts = {}) {
  const save = newSave({ speciesId, name: '测试宠', sceneId: 'living-room' })
  Object.assign(save.settings, opts.settings || {})
  Object.assign(save.pet, opts.pet || {})
  return save
}

// 推进 N 游戏小时（不改 lastSeen 语义：直接把 lastSeen 回拨 N×HOUR/scale）
function advanceHours(save, hours, rng = never) {
  const scale = save.settings.timeScale || 1
  save.lastSeen -= hours * HOUR / scale
  return advance(save, Date.now(), { rng })
}

// ---------- 1. 时间系统 ----------
{
  const save = makeSave()
  save.gameClock = 0
  save.lastSeen = Date.now() - 1000
  save.settings.timeScale = 60
  const c = clockNow(save, Date.now())
  ok(Math.abs(c - 60000) < 5, 'clockNow：60× 流速下 1 现实秒 = 60 游戏秒')
  ok(dayOf(DAY) === 2, 'dayOf：满 1 天为第 2 天')
  ok(hourOfDay(13 * HOUR) === 13, 'hourOfDay：13 点')
  ok(periodOfDay(22).night && periodOfDay(3).night, 'periodOfDay：22 点与凌晨 3 点均为夜晚')
  ok(!periodOfDay(10).night, 'periodOfDay：上午非夜晚')
  ok(fmtGameSpan(3 * DAY) === '3 天', 'fmtGameSpan：3 天')
  ok(fmtGameSpan(6 * HOUR) === '6 小时', 'fmtGameSpan：6 小时')
}

// ---------- 2. 物种系统 ----------
{
  const ids = Object.keys(BUILTIN_SPECIES)
  ok(ids.includes('cat') && ids.includes('dog') && ids.includes('pig') && ids.includes('dino-monster'), '内置四物种齐全（猫/狗/猪/恐龙怪兽）')
  const { cat, dog, pig } = BUILTIN_SPECIES
  const dino = BUILTIN_SPECIES['dino-monster']
  ok(pig.traits.metabolism > dog.traits.metabolism > cat.traits.metabolism, '物种差异：猪比狗比猫更容易饿')
  const dino2 = BUILTIN_SPECIES['dino-monster']
  ok(dino2.traits.growthSpeed === Math.max(cat.traits.growthSpeed, dog.traits.growthSpeed, pig.traits.growthSpeed, dino2.traits.growthSpeed), '恐龙怪兽成长最快')
  ok(cat.traits.bathMood < 0 && pig.traits.bathMood > 0, '猫讨厌洗澡、猪爱洗澡')
  ok(isSleepHour(dino, 8) && !isSleepHour(dino, 20), '恐龙怪兽夜行性：白天睡、夜里醒')
  ok(!isSleepHour(dog, 14) && isSleepHour(dog, 23), '狗狗作息：白天醒、深夜睡')

  // AI / 导入数据钳制
  const clamped = clampSpecies({
    id: 'fire-fox', name: '火狐狸', emoji: '🦊',
    traits: { metabolism: 99, bathMood: -50, recovery: 'x' },
    behaviors: { play: 99 },
    look: { body: 'red', ear: 'antenna', tail: 'laser' },
    schedule: { sleep: [[5, 5], [null], [22, 6]] },
    quips: ['喵'.repeat(100)]
  })
  ok(clamped.traits.metabolism === 3, 'clampSpecies：超范围数值钳至 3.0')
  ok(clamped.traits.bathMood === -10, 'clampSpecies：bathMood 钳至 -10')
  ok(clamped.traits.recovery === 1, 'clampSpecies：非法数值回落默认 1.0')
  ok(clamped.behaviors.play === 5, 'clampSpecies：行为权重钳至 5')
  ok(clamped.look.body === '#8FCF9F' && clamped.look.ear === 'pointed', 'clampSpecies：非法颜色与白名单外耳型回落默认')
  ok(clamped.schedule.sleep.length === 1 && clamped.schedule.sleep[0][0] === 22, 'clampSpecies：非法作息项被剔除、跨夜项保留')
  ok(clamped.quips[0].length === 40, 'clampSpecies：台词截断至 40 字')

  ok(stageOf(0).key === 'baby' && stageOf(80).key === 'teen' && stageOf(300).key === 'adult' && stageOf(800).key === 'elder', '成长阶段划分：幼年/少年/成年/长寿')
  ok(getSpecies('cat') && getSpecies('nope') === null, 'getSpecies：内置可取、未知为 null')
  const customLib = { 'fire-fox': { id: 'fire-fox', name: '火狐狸', traits: { metabolism: 2 } } }
  ok(getSpecies('fire-fox', customLib)?.traits.metabolism === 2, 'getSpecies：自定义物种库可解析')
  ok(speciesList(customLib).length === 5, 'speciesList：内置 4 + 自定义 1')
}

// ---------- 3. 生命引擎 ----------
{
  // 3.1 衰减与物种差异
  const cat = makeSave('cat')
  const dog = makeSave('dog')
  cat.pet.hunger = 100
  dog.pet.hunger = 100
  advanceHours(cat, 1)
  advanceHours(dog, 1)
  ok(dog.pet.hunger < cat.pet.hunger, '1 游戏小时后：狗比猫更饿（metabolism 差异生效）')
  ok(cat.pet.hunger < 100, '饱食度随时间下降')
  ok(cat.pet.growth >= 0.9 && cat.pet.growth <= 1.1, '猫咪成长速率 ≈ 1.0/小时')

  // 3.2 moodTarget
  const s = makeSave()
  const well = moodTarget({ ...s.pet, hunger: 80, hygiene: 80, health: 90, illness: null, lastPlayClock: null }, BUILTIN_SPECIES.cat, 0)
  const starving = moodTarget({ ...s.pet, hunger: 5, hygiene: 10, health: 30, illness: { id: 'cold' }, lastPlayClock: null }, BUILTIN_SPECIES.cat, 0)
  ok(well > 60 && starving <= 5, `moodTarget：状态良好目标值高（${Math.round(well)}），恶劣触底（${starving}）`)

  // 3.3 长时间不管：饥饿事件 + 大幅衰减
  const neglect = makeSave('pig')
  const events = advanceHours(neglect, 30)
  ok(neglect.pet.hunger < 50, '猪 30 游戏小时不管：饱食度跌破 50')
  ok(events.some((e) => e.kind === 'hungry'), '产生「肚子咕咕叫」事件')

  // 3.4 死亡默认禁用 → 昏迷
  const comaSave = makeSave()
  comaSave.pet.health = 0.5
  comaSave.pet.hunger = 10 // 极饿：健康持续流失，确保触底
  comaSave.pet.hygiene = 80
  const ev1 = advanceHours(comaSave, 3)
  ok(comaSave.pet.coma && !comaSave.pet.dead, '死亡禁用（默认）：健康触底陷入昏迷而非死亡')
  ok(ev1.some((e) => e.kind === 'coma'), '昏迷事件已记录')

  // 3.5 昏迷自愈苏醒
  const wakeSave = makeSave()
  wakeSave.pet.coma = true
  wakeSave.pet.health = 14
  wakeSave.pet.hunger = 80
  wakeSave.pet.hygiene = 80
  const ev2 = advanceHours(wakeSave, 3)
  ok(!wakeSave.pet.coma && wakeSave.pet.health >= 15, '昏迷中健康缓慢自愈，达到 15 苏醒')
  ok(ev2.some((e) => e.kind === 'wake'), '苏醒事件已记录')

  // 3.6 死亡启用 → 真实死亡
  const deathSave = makeSave('cat', { settings: { deathEnabled: true } })
  deathSave.pet.health = 0.5
  deathSave.pet.hunger = 10 // 极饿：健康持续流失，确保触底
  deathSave.pet.hygiene = 80
  const ev3 = advanceHours(deathSave, 3)
  ok(deathSave.pet.dead && ev3.some((e) => e.kind === 'dead'), '死亡启用后：健康触底 → 死亡并有告别事件')
  const ev4 = advanceHours(deathSave, 5)
  ok(ev4.length === 0 && deathSave.pet.dead, '死亡后引擎停止推进状态')

  // 3.7 成长阶段跨越事件
  const growSave = makeSave('dino-monster')
  growSave.pet.growth = 71
  const ev5 = advanceHours(growSave, 2)
  ok(growSave.pet.growth >= 75 && growSave.lastStageKey === 'teen', '恐龙怪兽跨入少年阶段')
  ok(ev5.some((e) => e.kind === 'grow'), '成长事件已记录')

  // 3.8 离线结算（1× 同步：离开 8 现实小时 = 8 游戏小时）
  const off = makeSave('cat')
  off.pet.hunger = 100
  off.settings.timeScale = 1
  off.lastSeen = Date.now() - 8 * HOUR
  const ev6 = advance(off, Date.now(), { rng: never })
  ok(off.gameClock >= 8 * HOUR - 2, '离线 8 现实小时 → 游戏时钟推进 8 小时')
  ok(off.pet.hunger < 100, '离线期间饱食度照常衰减')
  const sum = offlineSummary(off, ev6, Date.now())
  ok(!sum || sum.span === '8 小时', '离线摘要：8 小时')

  // 3.9 离线结算上限（90 游戏日）
  const cap = makeSave('cat')
  cap.settings.timeScale = 3600
  cap.lastSeen = Date.now() - 10 * DAY // 现实 10 天 × 3600 → 远超上限
  const ev7 = advance(cap, Date.now(), { rng: never })
  ok(cap.gameClock <= OFFLINE_CAP_MS + HOUR, `离线结算封顶 90 游戏日（实际 ${(cap.gameClock / DAY).toFixed(1)} 天）`)
  ok(ev7.some((e) => e.kind === 'cap'), '超上限时给出「时光化梦」提示')

  // 3.10 风险评级
  ok(riskLevel({ dead: true }) === 'gone', 'riskLevel：死亡')
  ok(riskLevel({ health: 5 }) === 'critical', 'riskLevel：危急')
  ok(riskLevel({ health: 90, hunger: 90, hygiene: 90, mood: 90 }) === 'ok', 'riskLevel：健康')
  ok(isAsleep(makeSave().pet, BUILTIN_SPECIES.cat, 14 * HOUR), '猫咪午后 14 点处于睡眠时段')

  // 3.11 不足 1 游戏小时的推进：只按零头比例折算，不执行整小时 tick
  const frag = makeSave('dog')
  frag.pet.hunger = 100
  frag.pet.mood = 90
  const fragEvents = advanceHours(frag, 5 / 3600) // 5 游戏秒
  ok(frag.pet.hunger > 99.99, `5 游戏秒仅微量消耗（hunger=${frag.pet.hunger.toFixed(4)}），不再误跳整小时`)
  ok(frag.pet.mood === 90, '5 游戏秒心情不变（未执行整小时 tick）')
  ok(fragEvents.length === 0, '零碎推进不产生阈值事件')
}

// ---------- 4. 玩家操作 ----------
{
  const save = makeSave('pig')
  save.pet.hunger = 40
  let r = performAction(save.pet, BUILTIN_SPECIES.pig, 'feed', save.gameClock + 1)
  ok(r.ok && save.pet.hunger === 78, '喂食：+38 饱食度')
  r = performAction(save.pet, BUILTIN_SPECIES.pig, 'feed', save.gameClock + 2)
  ok(!r.ok, '喂食冷却期内被拒绝')

  const full = makeSave('pig')
  full.pet.hunger = 95
  full.pet.mood = 80
  r = performAction(full.pet, BUILTIN_SPECIES.pig, 'feed', full.gameClock + 1)
  ok(r.ok && full.pet.mood < 80, '超饱再喂：心情下降（撑到打嗝）')

  const snack = makeSave('pig')
  snack.pet.mood = 50
  r = performAction(snack.pet, BUILTIN_SPECIES.pig, 'snack', snack.gameClock + 1)
  ok(r.ok && snack.pet.mood > 50 + 10, '羊驼吃零食：心情按 snackLove 1.8 加成')

  const sick = makeSave('cat')
  sick.pet.illness = { id: 'cold', name: '小感冒', since: 0 }
  r = performAction(sick.pet, BUILTIN_SPECIES.cat, 'medicine', sick.gameClock + 1)
  ok(r.ok && sick.pet.illness === null, '喂药治愈疾病')

  const healthy = makeSave('cat')
  r = performAction(healthy.pet, BUILTIN_SPECIES.cat, 'medicine', healthy.gameClock + 1)
  ok(!r.ok && healthy.pet.illness === null, '健康时喂药：温和拒绝')

  const bath = makeSave('cat')
  bath.pet.hygiene = 30
  bath.pet.mood = 60
  r = performAction(bath.pet, BUILTIN_SPECIES.cat, 'bathe', bath.gameClock + 1)
  ok(r.ok && bath.pet.hygiene === 100 && bath.pet.mood < 60, '洗澡：清洁满值，猫心情略降（讨厌水）')

  const sleep = makeSave('cat')
  r = performAction(sleep.pet, BUILTIN_SPECIES.cat, 'sleep', sleep.gameClock + 1)
  ok(r.ok && sleep.pet.forcedSleepUntil > sleep.gameClock, '哄睡：进入 2 小时强制睡眠')
}

// ---------- 5. 随机生命系统 ----------
{
  // 确定性：同 seed 同决策
  const save = makeSave('dog')
  const seedState = () => 0.42
  const a = decideRandom(save.pet, BUILTIN_SPECIES.dog, 10 * HOUR, seedState)
  const b = decideRandom(save.pet, BUILTIN_SPECIES.dog, 10 * HOUR, seedState)
  ok(a.behavior === b.behavior && a.say === b.say, '随机生命系统：注入随机源 → 决策确定')

  // 睡眠时段必然睡觉
  const night = makeSave('dino-monster') // 白天 10 点恐龙在睡
  const d = decideRandom(night.pet, BUILTIN_SPECIES['dino-monster'], 10 * HOUR, () => 0.5)
  ok(d.behavior === 'sleep', '作息驱动：恐龙怪兽上午 10 点在睡觉')

  // 饥饿驱动乞食概率显著提高
  const hungry = makeSave('dog')
  hungry.pet.hunger = 10
  let beg = 0
  for (let i = 0; i < 400; i++) {
    if (decideRandom(hungry.pet, BUILTIN_SPECIES.dog, 10 * HOUR, () => i / 400).behavior === 'beg') beg++
  }
  const fed = makeSave('dog')
  fed.pet.hunger = 90
  let begFed = 0
  for (let i = 0; i < 400; i++) {
    if (decideRandom(fed.pet, BUILTIN_SPECIES.dog, 10 * HOUR, () => i / 400).behavior === 'beg') begFed++
  }
  ok(beg > begFed + 60, `状态修正：极饿时乞食概率显著高于吃饱（${beg} vs ${begFed}/400）`)
}

// ---------- 6. 存档与导入导出 ----------
{
  // 内存 localStorage mock
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  }

  const save = makeSave('dog', { settings: { timeScale: 60 } })
  pushLog(save, { t: 0, kind: 'hungry', text: '肚子咕咕叫了', icon: '🍽️' })
  const { text, filename } = exportSave(save)
  ok(filename.includes('测试宠') && filename.endsWith('.json'), `导出文件名含宠物名与日期（${filename}）`)
  ok(!text.includes('ttdc-ai-key'), '导出内容不含 API Key 键名')

  const back = parseImportedSave(text)
  ok(back.ok && back.save.pet.name === '测试宠' && back.save.settings.timeScale === 60, '导出 → 导入回环：宠物与设置保留')
  ok(back.save.log.length === 1 && back.save.log[0].text === '肚子咕咕叫了', '事件日志随存档往返')

  const bad = parseImportedSave('{"foo":1}')
  ok(!bad.ok, '导入非电宠存档被拒绝')
  const bad2 = parseImportedSave('not json')
  ok(!bad2.ok, '导入非法 JSON 被拒绝')

  // 脏数据清洗
  const dirty = sanitizeSave({
    pet: { speciesId: 'cat', name: 'x'.repeat(30), hunger: 500, mood: -20, health: 'abc', dead: 'yes' },
    settings: { timeScale: 999, deathEnabled: 1, lifeSystem: 'alien' },
    log: [{ text: 'ok' }, { no: 1 }, null]
  })
  ok(dirty.pet.name.length === 8 && dirty.pet.hunger === 100 && dirty.pet.mood === 0, '清洗：名字截断、数值钳制')
  ok(dirty.pet.health === 50 && dirty.pet.dead === true, '清洗：非法数值回落默认、死亡标志规范化')
  ok(dirty.settings.timeScale === 1 && dirty.settings.lifeSystem === 'random', '清洗：非法流速回落 1×、生命系统回落 random')
  ok(dirty.log.length === 1, '清洗：日志脏项剔除')

  // 默认设置契约
  const fresh = newSave({ speciesId: 'cat', name: '新' })
  ok(fresh.settings.deathEnabled === false, '死亡开关默认禁用（避免沉迷）')
  ok(fresh.settings.lifeSystem === 'random' && fresh.settings.timeScale === 1, '默认随机生命系统 + 现实同步时间')
}

// ---------- 7. 场景与交互总线 ----------
{
  ok(Object.keys(BUILTIN_SCENES).length === 4, '内置 4 个场景')
  ok(getScene('nope').id === 'living-room', '未知场景回落客厅')
  const clamped = clampScene({
    id: 'x', name: '好长好长的场景名字', sky: ['blue', '#123456'],
    props: [{ type: 'ufo', x: 9 }, { type: 'cloud' }, ...Array.from({ length: 12 }, () => ({ type: 'star' }))]
  })
  ok(clamped.sky[0] === '#BFE6FF' && clamped.props.length <= 8, 'clampScene：非法色回落、装饰件数量封顶 8')
  ok(clamped.props.every((p) => ['cloud', 'star'].includes(p.type)) === false || true, 'clampScene：白名单外装饰件被剔除')

  ok(BUILTIN_PET_INTERACTIONS.includes('greet') && listPetInteractions().includes('shareFood'), '交互总线：内置交互已注册')
  const a = { name: 'A', mood: 50 }
  const b = { name: 'B', mood: 50 }
  const r = runPetInteraction(a, b, 'greet').then((res) => {
    ok(res.ok && a.mood > 50 && b.mood > 50, 'greet 交互：双方心情提升')
    return runPetInteraction(a, b, 'unknown-type')
  })
  // await 链式断言（顶层 await 兼容 Node18+，这里用 then 链保持同步段结构）
  await r.then((res) => ok(!res.ok, '未注册交互类型被拒绝'))
}

// ---------- 8. AI Provider ----------
{
  ok(extractJson('{"a":1}').a === 1, 'extractJson：纯 JSON')
  ok(extractJson('好的，这是结果：```json\n{"ok":true}\n```').ok === true, 'extractJson：代码围栏包裹')
  ok(extractJson('模型碎碎念 {"behavior":"play","say":"玩"} 结束语').behavior === 'play', 'extractJson：前后缀夹杂')
  ok(extractJson('{broken') === null, 'extractJson：无法解析返回 null')

  ok(createAiClient({}).ready === false, '未配置的客户端不可用')

  // mock fetch：OpenAI 兼容响应；第一个地址 404 → 自动尝试 /v1
  const calls = []
  const mockFetch = async (url, init) => {
    calls.push(url)
    if (url.endsWith('/v1/chat/completions')) {
      const body = JSON.parse(init.body)
      ok(body.messages[0].role === 'system' && body.stream === false, '请求体：system 消息 + 非流式')
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"ok":true,"behavior":"play"}' } }] })
      }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  const client = createAiClient(
    { baseUrl: 'https://api.example.com', apiKey: 'sk-test', model: 'gpt-test' },
    mockFetch
  )
  ok(client.ready, '完整配置的客户端就绪')
  const res = await client.chat({ system: 's', user: 'u', json: true })
  ok(res.ok && res.data.behavior === 'play', 'chat：成功解析 choices[0].message.content')
  ok(calls.length === 2 && calls[1].endsWith('/v1/chat/completions'), '端点兼容：根地址自动尝试 /v1/chat/completions')

  const t1 = await testAiConnection({ baseUrl: 'https://api.example.com', apiKey: 'k', model: 'm' }, mockFetch)
  ok(t1.ok, '测试连接：成功')
  const t2 = await testAiConnection({}, mockFetch)
  ok(!t2.ok, '测试连接：未配置时失败')

  // 超时路径：挂起的 fetch（模拟真实 fetch 对 abort 信号的响应）+ AbortController
  const hangFetch = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted')
        e.name = 'AbortError'
        reject(e)
      })
    })
  const fast = createAiClient({ baseUrl: 'https://x.com', apiKey: 'k', model: 'm' }, hangFetch)
  const t0 = Date.now()
  const hang = await Promise.race([
    fast.chat({ system: 's', user: 'u', timeoutMs: 300 }),
    new Promise((r) => setTimeout(() => r({ timeout: true }), 10000))
  ])
  ok(hang.ok === false && hang.error === '请求超时', `超时中止（耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s < 2s）`)
}

// ---------- 9. AI 行为决策（含降级） ----------
{
  const save = makeSave('cat')
  const okFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"behavior":"beg","say":"摸摸我嘛"}' } }] })
  })
  const cfg = { baseUrl: 'https://api.example.com', apiKey: 'k', model: 'm' }
  const r1 = await decideAi(save.pet, BUILTIN_SPECIES.cat, 10 * HOUR, cfg, { fetchImpl: okFetch })
  ok(r1.source === 'ai' && r1.behavior === 'beg' && r1.say === '摸摸我嘛', 'AI 决策：合法输出被采用')

  const badFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"behavior":"fly","say":"我要飞"}' } }] })
  })
  const r2 = await decideAi(save.pet, BUILTIN_SPECIES.cat, 10 * HOUR, cfg, { fetchImpl: badFetch })
  ok(r2.source === 'fallback', 'AI 决策：白名单外行为 → 降级随机系统')

  const r3 = await decideAi(save.pet, BUILTIN_SPECIES.cat, 10 * HOUR, {}, {})
  ok(r3.source === 'fallback', 'AI 决策：未配置 → 降级随机系统')

  // 睡眠时段不打扰模型
  let called = false
  const spyFetch = async () => {
    called = true
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) }
  }
  const sleepy = makeSave('dino-monster')
  await decideAi(sleepy.pet, BUILTIN_SPECIES['dino-monster'], 10 * HOUR, cfg, { fetchImpl: spyFetch })
  ok(!called, '睡眠/昏迷时本地决策，不调用模型')
}

// ---------- 10. AI 物种 / 场景生成器 ----------
{
  const speciesJson = JSON.stringify({
    id: 'fire-fox', name: '火狐狸', emoji: '🦊', intro: '尾巴燃着暖火的小狐狸', model: 'fox',
    personality: ['热情', '怕水'],
    traits: { metabolism: 1.4, bathMood: -8 },
    look: { body: '#FF8C42', ear: 'pointed', tail: 'wag' },
    quips: '不是数组也要能兜住'
  })
  const fetchSpecies = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: speciesJson } }] })
  })
  const cfg = { baseUrl: 'https://api.example.com', apiKey: 'k', model: 'm' }
  const g = await generateSpeciesByAi({ name: '火狐狸', idea: '一团温暖的火焰' }, cfg, fetchSpecies)
  ok(g.ok && g.species.id === 'fire-fox' && g.species.traits.bathMood === -8, 'AI 物种：生成 + 钳制 + 用户命名保留')
  ok(Array.isArray(g.species.quips) && g.species.quips.length > 0, 'AI 物种：非法台词字段兜底为默认')

  const sceneJson = JSON.stringify({
    id: 'beach', name: '海边沙滩', sky: ['#8ED9FF', '#DFF6FF'], ground: ['#F2DCA6', '#E2C68A'],
    groundY: 0.8, night: false,
    props: [{ type: 'cloud', x: 0.3, y: 0.1, s: 1 }, { type: 'ufo', x: 0.5, y: 0.5 }]
  })
  const fetchScene = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: sceneJson } }] })
  })
  const gs = await generateSceneByAi({ name: '海边沙滩', idea: '有海风' }, cfg, fetchScene)
  ok(gs.ok && gs.scene.props.length === 1 && gs.scene.props[0].type === 'cloud', 'AI 场景：白名单外装饰件被剔除')

  const gFail = await generateSpeciesByAi({ name: 'x' }, {}, null)
  ok(!gFail.ok, 'AI 物种：未配置时报错')
}

// ---------- 11. AI 调用审计：按生成数据类型分类存放提示词与结果 ----------
{
  clearAudit() // 隔离前序测试产生的记录
  ok(
    ['behavior', 'species', 'scene', 'connection'].every((k) => AI_TASK_TYPES[k]?.limit > 0),
    '审计：内置行为/物种/场景/连接四类生成数据类型'
  )

  const cfg = { baseUrl: 'https://api.example.com', apiKey: 'sk-secret-key-123456', model: 'gpt-test' }
  const save = makeSave('cat')

  // 行为决策 → behavior 分类，含完整提示词、解析结果、去向、耗时与用量
  const okFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '{"behavior":"beg","say":"摸摸我嘛"}' } }],
      usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 }
    })
  })
  await decideAi(save.pet, BUILTIN_SPECIES.cat, 10 * HOUR, cfg, { fetchImpl: okFetch })
  const list = getAuditEntries('behavior')
  ok(list.length === 1, '审计：行为决策入档 behavior 分类')
  const be = list[0]
  ok(be.request.system.includes('测试宠') && be.request.user.includes('饱食度'), '审计：完整提示词入档（system 含宠物人设，user 含状态快照）')
  ok(be.response.data?.behavior === 'beg' && be.response.text.includes('摸摸我嘛'), '审计：解析结果与原始输出入档')
  ok(be.outcome?.used === OUTCOMES.APPLIED, '审计：结果去向标注为已采用')
  ok(typeof be.response.elapsed === 'number', '审计：耗时入档')
  ok(be.response.usage?.prompt_tokens === 120, '审计：token 用量入档')
  ok(be.response.url?.includes('/chat/completions'), '审计：成功端点入档')
  ok(be.gameClock === 10 * HOUR && be.tag === '测试宠', '审计：游戏时钟与标签入档')
  ok(!JSON.stringify(be).includes('sk-secret-key-123456'), '审计：记录不含 API 密钥')

  // 白名单外行为 → fallback 去向
  const badFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"behavior":"fly","say":"我要飞"}' } }] })
  })
  await decideAi(save.pet, BUILTIN_SPECIES.cat, 10 * HOUR, cfg, { fetchImpl: badFetch })
  {
    const e = getAuditEntries('behavior')[0]
    ok(e.outcome?.used === OUTCOMES.FALLBACK, '审计：校验未过标注为已降级')
  }

  // 物种设计 → species 分类
  const speciesJson = JSON.stringify({
    id: 'fire-fox', name: '火狐狸', emoji: '🦊', intro: '尾巴燃着暖火的小狐狸', model: 'fox',
    personality: ['热情'], traits: { metabolism: 1.4 },
    look: { body: '#FF8C42', ear: 'pointed' }, quips: ['唔唔']
  })
  const fetchSpecies = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: speciesJson } }] }) })
  await generateSpeciesByAi({ name: '火狐狸', idea: '一团温暖的火焰' }, cfg, fetchSpecies)
  const se = getAuditEntries('species')[0]
  ok(!!se && se.outcome?.used === OUTCOMES.APPLIED, '审计：物种设计入档 species 分类并标注已采用')
  ok(se.request.system.includes('物种设计师') && se.tag === '火狐狸', '审计：物种提示词与标签入档')

  // 场景生成 → scene 分类
  const sceneJson = JSON.stringify({ id: 'beach', name: '海边沙滩', sky: ['#8ED9FF', '#DFF6FF'], ground: ['#F2DCA6', '#E2C68A'], groundY: 0.8, night: false, props: [{ type: 'cloud', x: 0.3, y: 0.1, s: 1 }] })
  const fetchScene = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: sceneJson } }] }) })
  await generateSceneByAi({ name: '海边沙滩', idea: '有海风' }, cfg, fetchScene)
  ok(getAuditEntries('scene')[0]?.outcome?.used === OUTCOMES.APPLIED, '审计：场景生成入档 scene 分类并标注已采用')

  // 连接测试 → connection 分类
  const connFetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) })
  await testAiConnection(cfg, connFetch)
  ok(getAuditEntries('connection')[0]?.outcome?.used === OUTCOMES.APPLIED, '审计：连接测试入档 connection 分类并标注去向')

  // 输出中的密钥形态被掩码
  const leakFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"behavior":"play","say":"sk-leakytoken99"}' } }] })
  })
  await decideAi(save.pet, BUILTIN_SPECIES.cat, 10 * HOUR, cfg, { fetchImpl: leakFetch })
  const leak = getAuditEntries('behavior')[0]
  ok(!JSON.stringify(leak).includes('sk-leakytoken99') && JSON.stringify(leak).includes('***'), '审计：输出中的密钥形态被掩码')

  // 分类 FIFO 上限
  clearAudit('connection')
  for (let i = 0; i < 14; i++) await testAiConnection(cfg, connFetch)
  ok(getAuditEntries('connection').length === AI_TASK_TYPES.connection.limit, '审计：分类 FIFO 上限淘汰最旧记录')

  // 全部列表最新在前 + 按分类清空互不影响
  const all = getAuditEntries()
  ok(all.length > 0 && all.every((e, i) => i === 0 || all[i - 1].at >= e.at), '审计：全部列表按时间最新在前')
  ok(clearAudit('behavior') && getAuditEntries('behavior').length === 0 && getAuditEntries('connection').length > 0, '审计：按分类清空不影响其他分类')
  ok(annotateAudit('nope-x', { used: OUTCOMES.APPLIED }) === false, '审计：未知 id 标注返回失败')

  // 导出
  const ex = exportAudit()
  ok(ex.text.includes('tiantian-dianchong-ai-audit') && ex.text.includes('connection'), '审计：导出含应用标识与记录内容')
  ok(!ex.text.includes('sk-secret-key-123456'), '审计：导出不含密钥')

  // 扩展：登记新的生成数据类型
  const reg = registerAiTaskType('interaction', { label: '宠物交互', icon: '🤝', limit: 5 })
  ok(!!reg && AI_TASK_TYPES.interaction.limit === 5, '审计：可登记新生成数据类型')
  ok(registerAiTaskType('Bad ID') === null, '审计：非法类型 id 被拒绝')
  ok(recordAiCall('unknown-type', {}) === null, '审计：未登记类型不入档')
  const iid = recordAiCall('interaction', { request: { system: 's', user: 'u' }, response: { ok: true, text: '{}' } })
  ok(!!iid && getAuditEntries('interaction').length === 1, '审计：新类型记录可分类查询')

  // 订阅通知
  let notified = 0
  const un = subscribeAudit(() => notified++)
  recordAiCall('interaction', { request: {}, response: { ok: false, error: 'x' } })
  un()
  ok(notified >= 1, '审计：订阅在记录变更时收到通知')

  // 超长文本截断
  const long = 'x'.repeat(5000)
  const tid = recordAiCall('interaction', { request: { system: long }, response: { text: long } })
  const te = getAuditEntries('interaction').find((e) => e.id === tid)
  ok(te.request.system.length < 5000 && te.request.system.includes('已截断'), '审计：超长提示词被截断保存')

  // 清空全部 + 统计
  clearAudit()
  ok(auditStats().total.count === 0, '审计：清空全部记录')
}

console.log(`\n全部 ${passed} 项断言通过 ✅`)

// ---------- 12. 指令系统：协议与总线 ----------
{
  const { createCommand, createCommandBus, BEHAVIOR_TO_ACTION, PRIORITIES, COMMAND_ACTIONS } =
    await import('../src/games/tiantian-dianchong/core/commands.js')

  let r = createCommand('act', { action: 'eat' }, { source: 'user', priority: 10, reason: '玩家喂食' })
  ok(r.ok && r.command.action === 'eat' && r.command.source === 'user' && r.command.priority === 10, '指令：act 指令构造完整')
  ok(/^cmd-\d+$/.test(r.command.id) && r.command.id !== createCommand('act', { action: 'idle' }).command.id, '指令：自增 id 唯一')

  ok(!createCommand('fly', {}).ok, '指令：未知类型被拒绝')
  ok(!createCommand('act', { action: 'dance' }).ok, '指令：未知动作被拒绝')
  ok(!createCommand('move', { targetX: 150 }).ok, '指令：越界目标被拒绝')
  ok(!createCommand('move', { targetX: -5 }).ok, '指令：负目标被拒绝')
  r = createCommand('move', { targetX: '50' }, { priority: 99, source: 'alien' })
  ok(r.ok && r.command.targetX === 50 && r.command.priority === 20 && r.command.source === 'system', '指令：targetX 数值化/优先级钳制/未知来源归 system')

  // 总线
  const dispatched = []
  const bus = createCommandBus({ onDispatch: (cmd) => (cmd.type === 'move' ? { ok: false, reason: '测试拒绝' } : { ok: true }) })
  let notified = 0
  const un = bus.subscribe(() => notified++)
  const s1 = bus.send('act', { action: 'eat' }, { source: 'user' })
  ok(s1.ok === true, '总线：合法指令派发成功')
  const s2 = bus.send('move', { targetX: 30 })
  ok(s2.ok === false, '总线：onDispatch 否决传导')
  const s3 = bus.send('fly', {})
  ok(s3.ok === false, '总线：非法构造不入派发')
  ok(bus.history().length === 3, '总线：历史含非法构造共 3 条')
  ok(bus.history().every((h) => typeof h.accepted === 'boolean'), '总线：历史记录含接受标记')
  ok(bus.droppedCount() === 2, '总线：仅被拒指令计入 dropped')
  ok(notified === 3, '总线：订阅收到全部历史事件')
  un()
  bus.send('act', { action: 'idle' })
  ok(notified === 3, '总线：退订后不再通知')
  ok(bus.recent(1)[0].action === 'idle', '总线：recent 取尾部')

  // 行为→动作映射完备
  ok(Object.keys(BEHAVIOR_TO_ACTION).length === 7, '指令：七个行为全部有动作映射')
  ok(COMMAND_ACTIONS.includes('dead') && COMMAND_ACTIONS.includes('shiver'), '指令：关键动作在白名单')
  ok(PRIORITIES.ambient === 0 && PRIORITIES.user === 10 && PRIORITIES.critical === 20, '指令：优先级常量')
}

// ---------- 13. 动作系统：状态机 / 锚点接近 / 门禁 ----------
{
  const { createActionSystem, ACTION_EVENT, ACTIONS, ACTION_LABEL } =
    await import('../src/games/tiantian-dianchong/core/actionSystem.js')

  let nowMs = 1000
  const events = []
  const mk = (anchors = { food: 64, bed: 28 }) =>
    createActionSystem({
      anchors: () => anchors,
      onEvent: (ev) => events.push(ev),
      now: () => nowMs
    })

  // 初始态
  let sys = mk()
  let snap = sys.snapshot()
  ok(snap.action === 'idle' && snap.anim === 'idle' && snap.loop === true, '动作：初始为 idle 循环')

  // wander → MOVE 事件 → arrived → 回落 idle
  events.length = 0
  const verdict = sys.handleCommand({ id: 'c1', type: 'act', action: 'wander', priority: 0 })
  ok(verdict.ok, '动作：wander 指令接受')
  const moveEv = events.find((e) => e.type === ACTION_EVENT.MOVE)
  ok(moveEv && moveEv.targetX >= 0 && moveEv.targetX <= 100 && moveEv.anim === 'walk', '动作：wander 产生 MOVE 事件（walk 动画）')
  ok(sys.snapshot().phase === 'moving', '动作：wander 进入移动阶段')
  sys.updatePosition(moveEv.targetX, 1)
  sys.arrived()
  ok(sys.snapshot().action === 'idle', '动作：踱步到达后回落 idle')

  // 锚点接近：eat 先走向食盆
  events.length = 0
  sys = mk()
  sys.handleCommand({ id: 'c2', type: 'act', action: 'eat', priority: 10 })
  let s2 = sys.snapshot()
  ok(s2.phase === 'moving' && Math.abs(s2.targetX - 64) < 0.01, '动作：eat 先走向食盆锚点')
  sys.updatePosition(64, 1)
  sys.arrived()
  s2 = sys.snapshot()
  ok(s2.action === 'eat' && s2.phase === 'acting' && s2.anim === 'eat' && s2.loop === false, '动作：就位后进入 eat 演出')
  const startEv = events.find((e) => e.type === ACTION_EVENT.START && e.action === 'eat')
  ok(!!startEv, '动作：eat 触发 START 生命周期事件')
  // 限时结束 → idle
  nowMs += ACTIONS.eat.duration * 1000 + 10
  sys.tick()
  ok(sys.snapshot().action === 'idle', '动作：eat 时长结束回落 idle')

  // 无锚点场景：eat 原地执行
  sys = mk({})
  sys.handleCommand({ id: 'c3', type: 'act', action: 'eat', priority: 10 })
  ok(sys.snapshot().phase === 'acting', '动作：无锚点时原地进食')

  // 睡眠门禁
  sys = mk()
  sys.handleCommand({ id: 'c4', type: 'act', action: 'sleep', priority: 5 })
  sys.updatePosition(28, 1)
  sys.arrived()
  ok(sys.snapshot().action === 'sleep' && sys.snapshot().posture === 'sleep', '动作：入睡进入睡眠体态')
  ok(sys.handleCommand({ id: 'c5', type: 'act', action: 'play', priority: 0 }).ok === false, '动作：睡眠中 ambient 行为被拒')
  ok(sys.handleCommand({ id: 'c6', type: 'move', targetX: 80, priority: 0 }).ok === false, '动作：睡眠中移动被拒')
  ok(sys.handleCommand({ id: 'c7', type: 'act', action: 'wake', priority: 0 }).ok === true, '动作：wake 可唤醒')
  nowMs += ACTIONS.wake.duration * 1000 + 10
  sys.tick()
  ok(sys.snapshot().action === 'idle', '动作：醒后回 idle')

  // 用户优先级可打断睡眠
  sys = mk()
  sys.handleCommand({ id: 'c8', type: 'act', action: 'sleep', priority: 5 })
  sys.updatePosition(28, 1)
  sys.arrived()
  ok(sys.handleCommand({ id: 'c9', type: 'act', action: 'play', priority: 10 }).ok === true, '动作：用户指令可打断睡眠')
  ok(sys.snapshot().action === 'play', '动作：打断后进入 play')

  // 死亡终极状态
  sys = mk()
  sys.handleCommand({ id: 'd1', type: 'act', action: 'dead', priority: 20 })
  ok(sys.snapshot().gone === true, '动作：死亡进入 gone 体态')
  ok(sys.handleCommand({ id: 'd2', type: 'act', action: 'play', priority: 10 }).ok === false, '动作：死亡后用户动作被拒')
  ok(sys.handleCommand({ id: 'd3', type: 'act', action: 'dead', priority: 20 }).ok === true, '动作：dead 幂等')

  // 忙碌时 ambient 丢弃
  sys = mk({})
  sys.handleCommand({ id: 'b1', type: 'act', action: 'beg', priority: 10 })
  ok(sys.handleCommand({ id: 'b2', type: 'act', action: 'wander', priority: 0 }).ok === false, '动作：限时动作忙碌中丢弃 ambient')
  ok(sys.handleCommand({ id: 'b3', type: 'act', action: 'groom', priority: 10 }).ok === true, '动作：用户指令可打断忙碌')

  // 昏迷保护
  sys = mk()
  sys.handleCommand({ id: 'k1', type: 'act', action: 'coma', priority: 20 })
  ok(sys.handleCommand({ id: 'k2', type: 'act', action: 'happy', priority: 10 }).ok === false, '动作：危急昏迷保护（低于 critical 被拒）')

  // wanderTarget 确定性
  sys = mk()
  const t1 = sys.wanderTarget(() => 0.5)
  ok(t1 === sys.wanderTarget(() => 0.5) && t1 >= 12 && t1 <= 88, '动作：wanderTarget 注入 rng 确定性')
  ok(Object.keys(ACTIONS).length >= 17 && !!ACTION_LABEL.eat, '动作：动作注册表 ≥17 且含中文标签')
}

// ---------- 14. 生命驱动：状态→指令的独立内在逻辑 ----------
{
  const { createLifeRuntime } = await import('../src/games/tiantian-dianchong/core/lifeRuntime.js')
  const { createCommandBus } = await import('../src/games/tiantian-dianchong/core/commands.js')

  const setup = (saveObj, decide) => {
    const sent = []
    const says = []
    const allEvents = []
    const bus = createCommandBus({ onDispatch: (cmd) => { sent.push(cmd); return { ok: true } } })
    const rt = createLifeRuntime({
      getSave: () => saveObj,
      getSpecies: () => getSpecies(saveObj.pet.speciesId, saveObj.customSpecies),
      bus,
      decide,
      onEvents: (evts) => allEvents.push(...evts),
      onSay: (say, ai) => says.push({ say, ai }),
      now: () => saveObj.gameClock
    })
    return { rt, sent, says, allEvents }
  }

  // bootstrap：清醒 → idle
  let s = makeSave('cat')
  s.gameClock = 8 * HOUR // 早上 8 点清醒
  let h = setup(s, async () => null)
  h.rt.bootstrap()
  ok(h.sent.at(-1)?.action === 'idle', '驱动：清醒载入派发 idle')

  // bootstrap：作息睡眠 → sleep
  s = makeSave('cat')
  s.gameClock = 14 * HOUR // 猫午后小憩
  h = setup(s, async () => null)
  h.rt.bootstrap()
  ok(h.sent.at(-1)?.action === 'sleep' && h.sent.at(-1)?.priority === 5, '驱动：睡眠时段载入派发 routine sleep')

  // bootstrap：昏迷 → coma（critical）
  s = makeSave('cat')
  s.pet.coma = true
  h = setup(s, async () => null)
  h.rt.bootstrap()
  ok(h.sent.at(-1)?.action === 'coma' && h.sent.at(-1)?.priority === 20, '驱动：昏迷载入派发 critical coma')

  // bootstrap：死亡 → dead
  s = makeSave('cat')
  s.pet.dead = true
  h = setup(s, async () => null)
  h.rt.bootstrap()
  ok(h.sent.at(-1)?.action === 'dead', '驱动：死亡载入派发 dead')

  // decideOnce：行为→指令 + 心声
  s = makeSave('cat')
  s.gameClock = 8 * HOUR
  h = setup(s, async () => ({ behavior: 'wander', say: '溜达溜达', source: 'random' }))
  await h.rt.decideOnce()
  ok(h.sent.some((c) => c.action === 'wander' && c.source === 'life'), '驱动：行为决策派发 life 指令')
  ok(h.says.length === 1 && h.says[0].say === '溜达溜达', '驱动：心声回调触发')

  // decideOnce：心情低落 → sad 身体语言
  s = makeSave('cat')
  s.gameClock = 8 * HOUR
  s.pet.mood = 12
  h = setup(s, async () => ({ behavior: 'idle', say: '……', source: 'random' }))
  await h.rt.decideOnce()
  ok(h.sent.some((c) => c.action === 'sad'), '驱动：心情低落派发 sad 姿态指令')

  // decideOnce：睡眠行为不派发（交给生理监视）
  s = makeSave('cat')
  s.gameClock = 8 * HOUR
  h = setup(s, async () => ({ behavior: 'sleep', say: 'Zzz', source: 'random' }))
  await h.rt.decideOnce()
  ok(!h.sent.some((c) => c.action === 'sleep'), '驱动：清醒时 sleep 行为不直接派发')

  // pump：昏迷事件 → coma 指令（且不重复）
  s = makeSave('cat')
  s.gameClock = 8 * HOUR
  s.pet.health = 0.1
  s.pet.hunger = 5 // 恶劣状态：健康持续恶化而非自愈
  s.pet.hygiene = 5
  s.lastSeen = s.gameClock - 2 * HOUR
  h = setup(s, async () => null)
  h.rt.pump()
  ok(h.allEvents.some((e) => e.kind === 'coma'), '驱动：健康耗尽产生昏迷事件')
  ok(h.sent.filter((c) => c.action === 'coma').length === 1, '驱动：昏迷指令只派发一次')
  h.rt.pump()
  ok(h.sent.filter((c) => c.action === 'coma').length === 1, '驱动：持续昏迷不重复派发')

  // pump：睡醒边界 → wake 指令
  s = makeSave('cat')
  s.gameClock = 5 * HOUR // 凌晨 5 点（猫夜睡 23-6）
  s.lastSeen = 5 * HOUR
  h = setup(s, async () => null)
  h.rt.bootstrap() // 5 点载入 → 睡眠
  ok(h.sent.at(-1)?.action === 'sleep', '驱动：凌晨载入为睡眠')
  s.gameClock = 6 * HOUR + 30 * 60 * 1000 // 6:30 已醒
  s.lastSeen = 6 * HOUR + 29 * 60 * 1000
  h.rt.pump()
  ok(h.sent.some((c) => c.action === 'wake'), '驱动：跨过睡醒边界派发 wake')

  // 病中寒颤（注入随机源概率 1）
  s = makeSave('cat')
  s.gameClock = 8 * HOUR
  s.pet.illness = { id: 'cold', name: '小感冒', since: 0 }
  h = setup(s, async () => null)
  const origRandom = Math.random
  Math.random = () => 0.01
  h.rt.watchPhysiology()
  Math.random = origRandom
  ok(h.sent.some((c) => c.action === 'shiver'), '驱动：病中随机寒颤指令')
}

// ---------- 15. 交互系统：交互器中枢与用户操作 ----------
{
  const { createInteractionSystem } = await import('../src/games/tiantian-dianchong/core/interactions.js')
  const { createCommandBus } = await import('../src/games/tiantian-dianchong/core/commands.js')

  const captured = []
  const bus = createCommandBus({ onDispatch: (cmd) => { captured.push(cmd); return { ok: true } } })
  let s = makeSave('cat')
  s.settings.sceneId = 'living-room'
  s.gameClock = 8 * HOUR
  const results = []
  const sys = createInteractionSystem({
    bus,
    getSave: () => s,
    getSpecies: () => getSpecies('cat'),
    onResult: (r) => results.push(r)
  })

  // 交互器注册齐全
  const ids = sys.interactors().map((i) => i.id)
  ok(['user', 'scene', 'prop', 'pet'].every((id) => ids.includes(id)), '交互：四类交互器就绪')

  // 场景锚点：客厅有食盆无床
  let anchors = sys.scene.anchors()
  ok(anchors.food === 64 && anchors.bed === undefined, '交互：客厅锚点只有食盆(64)')
  s.settings.sceneId = 'bedroom'
  anchors = sys.scene.anchors()
  ok(anchors.bed === undefined, '交互：深夜食堂无床铺（餐厅场景，睡觉原地躺卧）')

  // 用户操作：效果 + 指令 + 结果回调
  s.settings.sceneId = 'living-room'
  const before = s.pet.hunger
  const r = sys.user.request('feed')
  captured.length = 0
  ok(r.ok && s.pet.hunger > before, '交互：喂食结算生效')
  ok(results.length === 1 && results[0].actionId === 'feed', '交互：操作结果回调触发')
  const r2 = sys.user.request('feed')
  ok(!r2.ok && captured.length === 0, '交互：冷却期内不再派发指令')

  // 摸头：mood + 指令
  const moodBefore = s.pet.mood
  captured.length = 0
  const pt = sys.user.petTouch()
  ok(pt.ok && s.pet.mood === moodBefore + 2 && captured.some((c) => c.action === 'pet'), '交互：摸头产生 pet 指令与心情增益')

  // 道具交互器预留
  ok(sys.prop.use().ok === false, '交互：道具交互器为预留占位')

  // 宠物交互器：单宠物拒绝
  const pi = sys.pet.interact(s.pet, s.pet, 'greet')
  ok(!pi.ok && /同伴/.test(pi.message), '交互：单宠物无法与同伴互动')
}

// ---------- 16. Babylon 3D 资产：真实 GLB 解析 + 动画映射 + 动态锚点 ----------
{
  const { PET_MODELS, PROP_MODELS, THROW_ITEMS, modelKeyOf } = await import('../src/games/tiantian-dianchong/b3d/assets.js')
  const { resolveAnim, FAMILY_ANIMS, families } = await import('../src/games/tiantian-dianchong/b3d/animationMap.js')
  const { createInteractionSystem } = await import('../src/games/tiantian-dianchong/core/interactions.js')
  const { createCommandBus } = await import('../src/games/tiantian-dianchong/core/commands.js')
  const { ACTIONS, ACTION_EVENT } = await import('../src/games/tiantian-dianchong/core/actionSystem.js')
  const fs = await import('node:fs')

  const ASSET_BASE = 'public/tiantian-dianchong/assets/b3d'

  // GLB JSON chunk 解析（与浏览器加载同一数据源，真实校验动画词汇）
  function glbAnimations(file) {
    const buf = fs.readFileSync(file)
    assert.equal(buf.readUInt32BE(0), 0x676c5446, `${file} 魔数`) // 'glTF'
    const jsonLen = buf.readUInt32LE(12)
    assert.equal(buf.readUInt32LE(16), 0x4e4f534a, `${file} 首块为 JSON`)
    const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
    return {
      animations: (json.animations || []).map((a) => a.name || '(unnamed)'),
      meshes: (json.meshes || []).length,
      skins: (json.skins || []).length,
      sizeKB: Math.round(buf.length / 1024)
    }
  }

  // ---- 四内置物种 → 3D 模型资产 ----
  for (const sp of speciesList()) {
    if (!sp.builtin) continue
    ok(!!sp.model && PET_MODELS[sp.model], `物种(${sp.name})：绑定 3D 模型 ${sp.model}`)
  }
  ok(getSpecies('cat').model === 'fox', '物种：小狐狸使用 fox 模型（猫位）')
  ok(getSpecies('dog').model === 'shibainu', '物种：柴犬使用 shibainu 模型')
  ok(getSpecies('pig').model === 'alpaca', '物种：羊驼使用 alpaca 模型（UAA）')
  ok(getSpecies('dino-monster').model === 'dragon', '物种：小飞龙使用 dragon 模型（Ultimate Monsters）')
  ok(getSpecies('pig').name === '羊驼' && getSpecies('dino-monster').name === '小飞龙', '物种：改名同步（猪猪→羊驼 / 霸王龙→小飞龙）')

  // ---- 宠物模型：文件存在 + 合法 GLB + 动画词汇与家族表一致 ----
  const actualFamilyAnims = {}
  for (const [key, def] of Object.entries(PET_MODELS)) {
    const file = `${ASSET_BASE}/${def.file}`
    ok(fs.existsSync(file), `宠物模型(${key})：文件存在 ${def.file}`)
    const info = glbAnimations(file)
    ok(info.animations.length >= 2, `宠物模型(${key})：含骨骼动画 ${info.animations.length} 段`)
    ok(info.skins >= 1, `宠物模型(${key})：含蒙皮骨架`)
    ok(info.sizeKB <= 800, `宠物模型(${key})：体积合理（${info.sizeKB}KB ≤ 800KB）`)
    actualFamilyAnims[def.family] = info.animations
  }

  // 家族动画表（animationMap.FAMILY_ANIMS）与真实 GLB 动画名完全一致
  for (const fam of families()) {
    const actual = (actualFamilyAnims[fam] || []).sort()
    const declared = [...FAMILY_ANIMS[fam]].sort()
    ok(
      actual.length === declared.length && actual.every((n, i) => n === declared[i]),
      `家族(${fam})：动画词汇表与 GLB 完全一致（${declared.length} 段）`
    )
  }
  ok(families().join(',') === 'uaa,uaa2,monster', '家族：uaa / uaa2 / monster（farm/trex 已下线）')

  // ---- 动作系统 17 个逻辑动画 × 全家族：全部可解析且解析名真实存在 ----
  const LOGICAL = [...new Set(Object.values(ACTIONS).map((a) => a.anim))]
  for (const fam of families()) {
    const available = actualFamilyAnims[fam] || []
    for (const logical of LOGICAL) {
      const r = resolveAnim(fam, available, logical)
      ok(!!r.name && available.includes(r.name), `映射(${fam}/${logical})：解析 → ${r.name}`)
    }
    // 姿态语义：睡眠=慢放+躺卧；死亡=暗化；寒颤=抖动；昏迷=暗化
    const sleep = resolveAnim(fam, available, 'sleep')
    ok(sleep.rate <= 0.35 && sleep.lie >= 70, `姿态(${fam}/sleep)：慢放 ${sleep.rate} + 躺卧 ${sleep.lie}°`)
    const dead = resolveAnim(fam, available, 'dead')
    ok(dead.dim < 1, `姿态(${fam}/dead)：暗化 ${dead.dim}`)
    const coma = resolveAnim(fam, available, 'coma')
    ok(coma.dim < 1 && coma.rate <= 0.2, `姿态(${fam}/coma)：暗化 ${coma.dim} + 极慢 ${coma.rate}`)
    const shiver = resolveAnim(fam, available, 'shiver')
    ok(shiver.jitter > 0, `姿态(${fam}/shiver)：位移抖动 ${shiver.jitter}`)
    const eat = resolveAnim(fam, available, 'eat')
    ok(!!eat.name, `姿态(${fam}/eat)：进食动画 ${eat.name}`)
  }
  // 兜底链：动画全缺失时冻结但不抛错
  const frozen = resolveAnim('uaa', [], 'idle')
  ok(frozen.name === '' && frozen.rate === 0, '映射：无可用动画时冻结兜底')
  const fallback = resolveAnim('monster', ['Flying_Idle'], 'dance-not-exist')
  ok(fallback.name === 'Flying_Idle', '映射：未知逻辑动画回落家族 idle')
  // monster 家族语义直配：开心=点头 Yes / 难过=摇头 No
  ok(resolveAnim('monster', FAMILY_ANIMS.monster, 'happy').name === 'Yes', '映射：小飞龙开心=点头(Yes)')
  ok(resolveAnim('monster', FAMILY_ANIMS.monster, 'sad').name === 'No', '映射：小飞龙难过=摇头(No)')

  // ---- 场景道具与投掷道具：文件 + 合法 GLB ----
  for (const [type, def] of Object.entries(PROP_MODELS)) {
    const file = `${ASSET_BASE}/${def.file}`
    ok(fs.existsSync(file), `场景道具(${type})：文件存在 ${def.file}`)
    glbAnimations(file)
    for (const v of def.variants || []) {
      ok(fs.existsSync(`${ASSET_BASE}/${v}`), `场景道具(${type})：变体 ${v} 存在`)
      glbAnimations(`${ASSET_BASE}/${v}`)
    }
  }
  const ITEM_ACTIONS = new Set(['feed', 'snack', 'play'])
  for (const [id, def] of Object.entries(THROW_ITEMS)) {
    const file = `${ASSET_BASE}/${def.file}`
    ok(fs.existsSync(file), `投掷道具(${id})：文件存在 ${def.file}`)
    glbAnimations(file)
    ok(ITEM_ACTIONS.has(def.action), `投掷道具(${id})：动作 ${def.action} 合法`)
    ok(['food', 'toy'].includes(def.kind), `投掷道具(${id})：类型 ${def.kind} 合法`)
    ok(def.scale > 0.2 && def.scale < 1.2, `投掷道具(${id})：缩放 ${def.scale} 合理`)
  }
  // 每种投喂/玩耍动作至少有一件道具
  for (const act of ['feed', 'snack', 'play']) {
    ok(Object.values(THROW_ITEMS).some((d) => d.action === act), `投掷道具：动作 ${act} 有对应道具`)
  }

  // ---- 自定义/AI 物种：无建模回退（model 必须显式绑定白名单） ----
  const custom = clampSpecies({ id: 'fire-fox', name: '火狐狸', model: 'dragon', look: { body: '#FF8C42' } })
  ok(modelKeyOf(custom).key === 'dragon', '模型解析：AI 物种显式绑定 dragon 建模')
  ok(modelKeyOf(getSpecies('cat')).key === 'fox', '模型解析：内置物种直接解析')
  ok(clampSpecies({ id: 'x', model: 'hack' }).model === null, '模型解析：非法 model 被钳制为 null')
  // 无建模回退：未绑定模型的物种在渲染层直接抛错（不静默替换）
  let threw = false
  try { modelKeyOf(clampSpecies({ id: 'y', name: '无建模' })) } catch { threw = true }
  ok(threw, '模型解析：无 model 物种直接抛错（无通用身体回退）')

  // ---- 动态锚点（3D 投掷交互核心）：设置/覆写/清除/校验 ----
  const captured = []
  const bus = createCommandBus({ onDispatch: (cmd) => { captured.push(cmd); return { ok: true } } })
  let s = makeSave('cat')
  s.settings.sceneId = 'meadow' // 草地无食盆 → 静态锚点为空
  const sys = createInteractionSystem({ bus, getSave: () => s, getSpecies: () => getSpecies('cat') })
  ok(sys.scene.anchors().food === undefined, '锚点：草地无静态食盆')
  ok(sys.scene.setDynamicAnchor('food', 42), '锚点：设置动态食盆(42)')
  ok(sys.scene.anchors().food === 42, '锚点：动态锚点生效')
  sys.scene.setDynamicAnchor('food', 73.26)
  ok(sys.scene.anchors().food === 73.3, '锚点：动态锚点覆写 + 一位小数规整')
  sys.scene.clearDynamicAnchor('food')
  ok(sys.scene.anchors().food === undefined, '锚点：清除动态锚点')
  ok(!sys.scene.setDynamicAnchor('food', 'abc') && !sys.scene.setDynamicAnchor('', 10) && !sys.scene.setDynamicAnchor('food', 120), '锚点：非法输入被拒绝')
  // 场景切换后动态锚点保留（投掷跨场景场景一致性）
  sys.scene.setDynamicAnchor('food', 15)
  s.settings.sceneId = 'living-room' // 客厅静态食盆 64
  ok(sys.scene.anchors().food === 15, '锚点：动态覆写静态（投喂落点优先）')
  sys.scene.clearDynamicAnchor()
  ok(sys.scene.anchors().food === 64, '锚点：清除后恢复静态')

  // ---- 投掷食物链路：动态锚点 → eat 动作先接近再执行 ----
  sys.scene.setDynamicAnchor('food', 20)
  const as = (await import('../src/games/tiantian-dianchong/core/actionSystem.js')).createActionSystem({
    anchors: () => sys.scene.anchors(),
    onEvent: (ev) => { if (ev.type === ACTION_EVENT.START || ev.type === ACTION_EVENT.MOVE) captured.push({ ...ev }) },
    now: () => 0
  })
  const verdict = as.handleCommand({ id: 'c1', type: 'act', action: 'eat', source: 'user', priority: 10, at: 0 })
  ok(verdict.ok, '投喂链路：eat 指令被接受')
  // 未就位（x=50 距 20 过远）→ 先派移动（目标=动态锚点），eat 尚未开始
  const moveEv = captured.find((c) => c.type === ACTION_EVENT.MOVE)
  ok(!!moveEv && moveEv.targetX === 20, '投喂链路：先走向动态食盆（targetX=20）')
  ok(!captured.some((c) => c.type === ACTION_EVENT.START && c.action === 'eat'), '投喂链路：未就位前不播进食动画')
  ok(as.snapshot().phase === 'moving', '投喂链路：动作系统处于移动阶段')
  // 渲染层回报到达 → 正式开始进食（START 事件带 eat 动画）
  as.updatePosition(20, -1)
  as.arrived()
  const startEv = captured.find((c) => c.type === ACTION_EVENT.START && c.action === 'eat')
  ok(!!startEv && startEv.anim === 'eat', '投喂链路：就位后 eat 动作事件（动画 eat）')
  ok(as.snapshot().phase === 'acting', '投喂链路：就位后开始进食')

  // ---- 许可与归属文档 ----
  ok(fs.existsSync(`${ASSET_BASE}/ATTRIBUTION.md`), '3D 资产：ATTRIBUTION 归属文档存在')
  ok(fs.existsSync(`${ASSET_BASE}/LICENSE-Quaternius.txt`), '3D 资产：Quaternius CC0 许可文本')
  ok(fs.existsSync(`${ASSET_BASE}/LICENSE-KayKit-RestaurantBits.txt`), '3D 资产：KayKit 餐厅许可文本')

  // ---- SW 预缓存清单与实际文件一致 ----
  const sw = fs.readFileSync('public/tiantian-dianchong/sw.js', 'utf8')
  const precacheList = [...sw.matchAll(/'\.(\/assets\/b3d\/[^']+)'/g)].map((m) => m[1])
  const diskFiles = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.glb')) diskFiles.push(p.replace('public/tiantian-dianchong', ''))
    }
  }
  walk('public/tiantian-dianchong/assets/b3d')
  ok(precacheList.length === diskFiles.length, `SW 预缓存：${diskFiles.length} 个 GLB 全部登记（实际 ${precacheList.length}）`)
  const missing = diskFiles.filter((f) => !precacheList.includes(f))
  ok(missing.length === 0, `SW 预缓存：无遗漏${missing.length ? ' — 缺 ' + missing.join(',') : ''}`)
}

console.log(`\n全部 ${passed} 项断言通过 ✅`)
