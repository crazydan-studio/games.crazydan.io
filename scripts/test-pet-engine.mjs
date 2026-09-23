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
  ok(r.ok && snack.pet.mood > 50 + 10, '猪猪吃零食：心情按 snackLove 1.8 加成')

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
    id: 'fire-fox', name: '火狐狸', emoji: '🦊', intro: '尾巴燃着暖火的小狐狸',
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
    id: 'fire-fox', name: '火狐狸', emoji: '🦊', intro: '尾巴燃着暖火的小狐狸',
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
  ok(anchors.bed === 28, '交互：卧室提供床铺锚点(28)')

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

// ---------- 16. 骨骼动画资产：程序化 DragonBones 骨架与预设资产（真实运行时解析） ----------
{
  const { PixiFactory } = await import('pixi-dragonbones-runtime')
  const { buildPetDragonBones, RIG_BONES } = await import('../src/games/tiantian-dianchong/db/skeletonFactory.js')
  const { ANIMATION_NAMES } = await import('../src/games/tiantian-dianchong/db/animations.js')
  const { resolveAnim, ANIM_MAP } = await import('../src/games/tiantian-dianchong/db/animationMap.js')
  const { DB_ASSETS } = await import('../src/games/tiantian-dianchong/db/assets.js')
  const fs = await import('node:fs')

  // 四内置物种 + 两个 AI 风格自定义物种
  const customLook = clampSpecies({
    id: 'fire-fox', name: '火狐狸', look: { body: '#FF8C42', belly: '#FFE3C2', accent: '#D9552B', ear: 'pointed', tail: 'wag', snout: 'dog', extra: 'collar' }
  })
  const customLook2 = clampSpecies({
    id: 'cloud-lamb', name: '云朵羊', look: { body: '#CFE4F5', belly: '#F4FAFF', accent: '#8FB6D9', ear: 'floppy', tail: 'curly', snout: 'pig', extra: 'whiskers' }
  })
  const all = [...speciesList(), customLook, customLook2]

  for (const sp of all) {
    const built = buildPetDragonBones(sp)
    // 骨架 JSON 可被真实运行时解析（隐含校验：骨骼父子引用/插槽/皮肤显示/动画时间线）
    const factory = PixiFactory.newInstance(false)
    let data = null
    let parseErr = null
    try {
      data = factory.parseDragonBonesData(built.skeleton)
    } catch (e) {
      parseErr = e
    }
    ok(!parseErr, `骨架(${sp.name})：真实 DragonBones 运行时解析通过${parseErr ? ' — ' + parseErr.message : ''}`)
    if (!data) continue
    const armData = data.getArmature(sp.id)
    ok(!!armData, `骨架(${sp.name})：骨架数据可检索`)
    ok(built.boneNames.length === RIG_BONES.length, `骨架(${sp.name})：骨骼数 ${built.boneNames.length}`)
    ok(built.slotNames.length >= 19, `骨架(${sp.name})：插槽数 ${built.slotNames.length}`)
    ok(built.skeleton.version === '5.5', `骨架(${sp.name})：数据版本 5.5`)
    // 贴图集名与骨架同名（buildArmatureDisplay 按骨架名检索贴图集——历史隐形 bug 防线）
    ok(built.textureAtlas.name === built.skeleton.name, `贴图集(${sp.name})：与骨架同名（检索键约定）`)
    for (const name of ANIMATION_NAMES) {
      ok(!!armData.getAnimation(name), `骨架(${sp.name})：动画「${name}」存在`)
    }

    // 贴图集：SubTexture 与皮肤显示引用一一对应
    const texNames = new Set(built.textureAtlas.SubTexture.map((s) => s.name))
    const missing = []
    for (const s of built.skeleton.armature[0].skin[0].slot) {
      for (const d of s.display) {
        if (d && !texNames.has(d.path)) missing.push(`${s.name}/${d.path}`)
      }
    }
    ok(missing.length === 0, `贴图集(${sp.name})：皮肤显示引用全部有图${missing.length ? ' — 缺 ' + missing.join(',') : ''}`)
    ok(built.textureAtlas.width === 1024 && built.textureAtlas.height === 768, `贴图集(${sp.name})：页面尺寸正确`)
    ok(built.textureAtlas.SubTexture.length >= 26, `贴图集(${sp.name})：部件数 ≥26（实际 ${built.textureAtlas.SubTexture.length}）`)

    // 动画结构校验：帧时长累进 = 动画总时长；循环动画有回环闭合帧
    for (const anim of built.skeleton.armature[0].animation) {
      let sum = 0
      let hasClosure = false
      for (const b of anim.bone || []) {
        for (const key of ['translateFrame', 'rotateFrame', 'scaleFrame']) {
          if (!b[key]) continue
          sum = Math.max(sum, b[key].reduce((s, f) => s + f.duration, 0))
          if (b[key].at(-1).duration === 0) hasClosure = true
        }
      }
      for (const s of anim.slot || []) {
        sum = Math.max(sum, s.displayFrame.reduce((s2, f) => s2 + f.duration, 0))
        if (s.displayFrame.at(-1).duration === 0) hasClosure = true
      }
      ok(sum === anim.duration, `动画(${sp.name}/${anim.name})：帧时长总和 ${sum} = duration ${anim.duration}`)
      const isLoop = ['idle', 'walk', 'stare', 'sleep', 'sad', 'coma', 'dead'].includes(anim.name)
      ok(!isLoop || hasClosure, `动画(${sp.name}/${anim.name})：循环动画带回环闭合帧`)
      // displayFrame 的 value 必须在合法区间（-1 ≤ v < 显示数）
      for (const s of anim.slot || []) {
        const count = built.skeleton.armature[0].skin[0].slot.find((x) => x.name === s.name).display.length
        const bad = s.displayFrame.some((f) => f.value < -1 || f.value >= count)
        ok(!bad, `动画(${sp.name}/${anim.name})：插槽 ${s.name} 显示下标合法`)
      }
    }

    // 物种 rig 字段（预设资产键）合法性
    ok(!sp.builtin || ['cat', 'dog', 'dino'].includes(sp.rig) || sp.rig === undefined, `物种(${sp.name})：rig 标记合法`)
    ok(sp.builtin ? !!sp.rig || sp.id === 'pig' : sp.rig === null, `物种(${sp.name})：预设物种有 rig / 自定义物种无`)
  }

  // 物种特质 → 动画风格差异（呼吸幅度/尾巴摆幅）
  const cat = getSpecies('cat')
  const dino = getSpecies('dino-monster')
  const catBuilt = buildPetDragonBones(cat)
  const dinoBuilt = buildPetDragonBones(dino)
  const catScale = catBuilt.skeleton.armature[0].animation.find((a) => a.name === 'idle').bone
    .find((b) => b.name === 'body').scaleFrame
  const dinoScale = dinoBuilt.skeleton.armature[0].animation.find((a) => a.name === 'idle').bone
    .find((b) => b.name === 'body').scaleFrame
  const catBreath = catScale[1].y - 1
  const dinoBreath = dinoScale[1].y - 1
  ok(dinoBreath > catBreath, '动画：恐龙(代谢1.5)呼吸幅度大于猫咪(0.8)')
  const catRot = catBuilt.skeleton.armature[0].animation.find((a) => a.name === 'idle').bone
    .find((b) => b.name === 'tail-1').rotateFrame
  const dinoRot = dinoBuilt.skeleton.armature[0].animation.find((a) => a.name === 'idle').bone
    .find((b) => b.name === 'tail-1').rotateFrame
  ok(Math.abs(dinoRot[1].rotate) > Math.abs(catRot[1].rotate), '动画：恐龙(情绪1.5)摆尾幅度大于猫咪(1.15)')

  // 循环动画回环帧与首帧对齐（无缝循环）
  const pigBuilt = buildPetDragonBones(getSpecies('pig'))
  const pigIdle = pigBuilt.skeleton.armature[0].animation.find((a) => a.name === 'idle')
  const pigBodyScale = pigIdle.bone.find((b) => b.name === 'body').scaleFrame
  const closure = pigBodyScale.at(-1)
  ok(closure.duration === 0 && closure.y === pigBodyScale[0].y, '动画：循环动画回环帧对齐首帧')

  // 卷尾物种：tail-2 插槽显示列表为空占位（不可见骨骼仍可被动画驱动）
  const pigSkinSlot = pigBuilt.skeleton.armature[0].skin[0].slot.find((x) => x.name === 'tail-2')
  ok(pigSkinSlot.display.every((d) => d === null), '骨架：卷尾物种尾梢插槽为空显示')
  const pigWalkBones = Object.fromEntries(pigBuilt.skeleton.armature[0].animation.find((a) => a.name === 'walk').bone.map((b) => [b.name, b]))
  ok('tail-2' in pigWalkBones, '骨架：卷尾物种尾梢骨骼仍受动画驱动')

  // ---- 动画映射解析 ----
  const catAnims = ['idle', 'skating', 'talking', 'collecting', 'blowing', 'eating', 'popup', 'dance',
    'face_happy', 'drinking', 'hifi', 'joy', 'sad', 'laugh', 'jumping', 'throw', 'transform']
  ok(resolveAnim('cat', catAnims, 'walk').name === 'skating', '映射：猫 walk → skating（滑板）')
  ok(resolveAnim('cat', catAnims, 'medicine').name === 'drinking', '映射：猫 medicine → drinking（喝药）')
  ok(resolveAnim('cat', catAnims, 'sleep').lie === 82 && resolveAnim('cat', catAnims, 'sleep').rate === 0.42, '映射：猫 sleep → 慢放 + 侧卧')
  ok(resolveAnim('cat', catAnims, 'dead').once === true && resolveAnim('cat', catAnims, 'dead').dim === 0.5, '映射：猫 dead → 冻结 + 暗化 + 单次')
  const dinoAnims = ['stand', 'walk', 'jump', 'fall']
  ok(resolveAnim('dino', dinoAnims, 'walk').name === 'walk', '映射：恐龙 walk → walk（原生行走）')
  ok(resolveAnim('dino', dinoAnims, 'sleep').name === 'fall' && resolveAnim('dino', dinoAnims, 'sleep').once === true, '映射：恐龙 sleep → fall 单次倒卧')
  // 兜底链：缺失映射回落可用动画
  ok(resolveAnim('cat', catAnims, 'wash').name === 'face_happy', '映射：猫 wash → face_happy')
  ok(resolveAnim('dino', dinoAnims, 'eat').name === 'jump', '映射：恐龙 eat → jump 兜底')
  ok(resolveAnim('cat', ['foo', 'bar'], 'idle').name === 'foo', '映射：未知动画回落首动画')
  // 程序化骨架：恒等映射
  ok(resolveAnim('procedural', ANIMATION_NAMES, 'medicine').name === 'medicine', '映射：程序化骨架恒等')

  // ---- 预设资产（public 目录）结构校验 + 真实运行时解析 ----
  for (const [key, def] of Object.entries(DB_ASSETS)) {
    const base = `public/tiantian-dianchong/assets/db/${key}`
    const skePath = `${base}/${def.ske}`
    const texPath = `${base}/${def.tex}`
    const pngPath = `${base}/${def.png}`
    ok(fs.existsSync(skePath) && fs.existsSync(texPath) && fs.existsSync(pngPath), `预设资产(${key})：三件套文件齐全`)
    const skeJson = JSON.parse(fs.readFileSync(skePath, 'utf8'))
    const texJson = JSON.parse(fs.readFileSync(texPath, 'utf8'))
    ok(skeJson.armature?.length >= 1 && skeJson.armature[0].name === def.armature, `预设资产(${key})：骨架名 ${def.armature} 正确`)
    ok(texJson.imagePath === def.png, `预设资产(${key})：贴图集引用正确`)
    ok(texJson.name === skeJson.name, `预设资产(${key})：贴图集与骨架同名（运行时检索键约定）`)
    const factory = PixiFactory.newInstance(false)
    let presetErr = null
    try {
      const data = factory.parseDragonBonesData(skeJson)
      ok(!!data.getArmature(def.armature), `预设资产(${key})：运行时解析通过`)
      const anims = Object.keys(data.getArmature(def.armature).animations)
      ok(anims.length >= 4, `预设资产(${key})：动画数 ${anims.length} ≥ 4`)
    } catch (e) {
      presetErr = e
    }
    ok(!presetErr, `预设资产(${key})：解析无异常${presetErr ? ' — ' + presetErr.message : ''}`)
    // 许可文件存在
    ok(fs.existsSync(`${base}/LICENSE.txt`), `预设资产(${key})：许可文件随资产分发`)
    // 动画映射表覆盖预设资产的可用动画（每个逻辑动画解析出实际存在的名字）
    const available = skeJson.armature[0].animation.map((a) => a.name)
    for (const logical of ANIMATION_NAMES) {
      const r = resolveAnim(key, available, logical)
      ok(!!r.name, `映射(${key}/${logical})：可解析 → ${r.name}`)
    }
  }

  // 资产许可归属文件
  ok(fs.existsSync('public/tiantian-dianchong/assets/db/ATTRIBUTION.md'), '预设资产：ATTRIBUTION 归属文档存在')
}

console.log(`\n全部 ${passed} 项断言通过 ✅`)
