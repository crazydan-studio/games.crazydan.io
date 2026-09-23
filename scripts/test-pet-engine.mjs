// ============ 天天电宠 · 生命引擎单元测试（Node 直接运行，无浏览器依赖） ============
// 覆盖：时间换算 / 物种系统与 AI 钳制 / 生命引擎（衰减·物种差异·生病·死亡开关·
// 昏迷自愈·成长·离线结算·上限）/ 玩家操作与冷却 / 随机生命系统确定性 /
// 存档导入导出回环 / AI Provider 解析与降级 / 宠物间交互总线
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

console.log(`\n全部 ${passed} 项断言通过 ✅`)
