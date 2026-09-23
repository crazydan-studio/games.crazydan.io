// ============ AI Provider（OpenAI 兼容客户端） ============
// 对接主流大模型的统一出口：POST {baseUrl}/chat/completions
//   · Authorization: Bearer {apiKey}，模型名可配置
//   · 8s 超时（AbortController）；仅 https/http 同源可用的地址
//   · JSON 解析带「抽取平衡花括号块」兜底（容忍模型输出前后缀文本）
// fetch 可注入（单测 mock 用）。

const TIMEOUT_MS = 8000

function normalizeBaseUrl(baseUrl) {
  const s = String(baseUrl || '').trim()
  if (!s) return ''
  return s.replace(/\/+$/, '') // 去尾部斜杠；调用方拼接 /chat/completions
}

function endpoints(baseUrl) {
  const base = normalizeBaseUrl(baseUrl)
  // 同时兼容「填了完整 chat 地址」与「只填站点根」两种习惯
  if (/\/chat\/completions$/.test(base)) return [base]
  return [`${base}/chat/completions`, `${base}/v1/chat/completions`]
}

// 从模型输出中抽取 JSON：整体解析失败时扫描平衡花括号块
export function extractJson(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  const direct = tryParse(text)
  if (direct !== undefined) return direct
  // ```json ... ``` 代码块优先
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  if (fence) {
    const inner = tryParse(fence[1].trim())
    if (inner !== undefined) return inner
  }
  // 平衡花括号扫描
  for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
    let depth = 0
    for (let j = i; j < text.length; j++) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') {
        depth--
        if (depth === 0) {
          const parsed = tryParse(text.slice(i, j + 1))
          if (parsed !== undefined) return parsed
          break
        }
      }
    }
  }
  return null
}

function tryParse(s) {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

export function createAiClient({ baseUrl, apiKey, model }, fetchImpl = null) {
  const doFetch = fetchImpl || globalThis.fetch?.bind(globalThis)
  return {
    ready: !!(normalizeBaseUrl(baseUrl) && apiKey && model && doFetch),

    /**
     * 单轮对话
     * @returns {Promise<{ok: boolean, text?: string, error?: string, data?: any}>}
     */
    async chat({ system, user, json = false, temperature = 0.8, signal, timeoutMs = TIMEOUT_MS } = {}) {
      if (!this.ready) return { ok: false, error: 'AI 未配置（缺少地址 / 密钥 / 模型名）' }
      const urls = endpoints(baseUrl)
      const body = {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature,
        stream: false
      }
      if (json) body.response_format = { type: 'json_object' }

      let lastError = ''
      for (const url of urls) {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), timeoutMs)
        const onOuterAbort = () => ctrl.abort()
        signal?.addEventListener('abort', onOuterAbort, { once: true })
        try {
          const res = await doFetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(body),
            signal: ctrl.signal
          })
          if (!res.ok) {
            lastError = `接口返回 ${res.status}`
            continue
          }
          const payload = await res.json()
          const text = payload?.choices?.[0]?.message?.content
          if (typeof text !== 'string' || !text.trim()) {
            lastError = '模型返回为空'
            continue
          }
          return { ok: true, text, data: json ? extractJson(text) : text }
        } catch (e) {
          if (signal?.aborted) return { ok: false, error: '已取消' }
          lastError = e?.name === 'AbortError' ? '请求超时' : `网络错误：${e?.message || e}`
        } finally {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onOuterAbort)
        }
      }
      return { ok: false, error: lastError || '请求失败' }
    }
  }
}

// 测试连接（设置面板「测试连接」按钮）
export async function testAiConnection(cfg, fetchImpl = null) {
  const client = createAiClient(cfg, fetchImpl)
  if (!client.ready) return { ok: false, error: '请先填写完整：接口地址、API 密钥、模型名' }
  const res = await client.chat({
    system: '你是连通性测试器，只输出 JSON。',
    user: '请输出 {"ok":true}',
    json: true,
    temperature: 0
  })
  if (!res.ok) return { ok: false, error: res.error }
  if (!res.data || res.data.ok !== true) return { ok: false, error: '模型未按预期应答，请检查模型名' }
  return { ok: true }
}
