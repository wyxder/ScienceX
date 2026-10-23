const { generateReply } = require('../../lib/ai');
const { score } = require('./scorer');

const LIVE_SYSTEM_PROMPT = '你是严谨科研助手。没有原文或数据时不得编造数值、引用或页码，应明确说明证据不足。';

function abortError() {
  const err = new Error('评测运行已取消');
  err.name = 'AbortError';
  err.code = 'ABORT_ERR';
  return err;
}

/**
 * 纯执行器：逐题执行、模板/live 模式适配、逐题回调、取消
 */
async function runSuite({
  suite,
  mode = 'template',
  chat = null,
  signal = null,
  timeoutMs = 60000,
  onProgress = null,
}) {
  const results = [];
  const cases = suite.cases || [];

  for (const [index, item] of cases.entries()) {
    if (signal?.aborted) throw abortError();

    const messages = [{ role: 'user', content: item.question }];
    const startedAt = Date.now();

    // 1. 模板模式运行
    const templateText = generateReply(messages, item.scene);
    const templateScore = score(templateText, item.expected);
    const template = {
      status: 'completed',
      text: templateText,
      score: templateScore.score,
      matched: templateScore.matched,
      missing: templateScore.missing,
      latency_ms: Math.max(1, Date.now() - startedAt),
      truncated: false,
    };

    // 2. live 模式运行（如果开启）
    let live = { status: 'skipped' };
    if (mode === 'live') {
      if (typeof chat !== 'function') {
        const err = new Error('live 模式未提供可用模型调用函数');
        err.code = 'MODEL_NOT_CONFIGURED';
        throw err;
      }
      const liveStarted = Date.now();
      try {
        const result = await chat(
          [{ role: 'system', content: LIVE_SYSTEM_PROMPT }, ...messages],
          { temperature: 0, max_tokens: 700, timeoutMs, signal }
        );
        const text = result?.text || '';
        const liveScore = score(text, item.expected);
        live = {
          status: 'completed',
          text,
          model: result?.model || 'unknown',
          usage: result?.usage || {},
          score: liveScore.score,
          matched: liveScore.matched,
          missing: liveScore.missing,
          latency_ms: Math.max(1, Date.now() - liveStarted),
          truncated: false,
        };
      } catch (error) {
        if (signal?.aborted) throw abortError();
        live = {
          status: 'failed',
          error: error.code || error.message || 'MODEL_CALL_FAILED',
          latency_ms: Math.max(1, Date.now() - liveStarted),
        };
      }
    }

    // 3. 逐题判定
    const failed =
      template.score < item.minimum ||
      (mode === 'live' && (live.status !== 'completed' || (live.score ?? 0) < item.minimum));

    const row = {
      case_id: item.id,
      question: item.question,
      scene: item.scene,
      minimum: item.minimum,
      status: failed ? 'failed' : 'passed',
      template,
      live,
      score: mode === 'live' ? (live.score ?? 0) : template.score,
      error: mode === 'live' && live.status === 'failed' ? live.error : null,
    };

    results.push(row);
    onProgress?.({ completed: index + 1, total: cases.length, row });
  }

  return { case_results: results };
}

module.exports = {
  runSuite,
  LIVE_SYSTEM_PROMPT,
  abortError,
};
