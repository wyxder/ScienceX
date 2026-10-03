/* 临时探测脚本：验证 OpenAI Next 网关对 embeddings / audio / vision / models 端点的支持情况 */
const BASE = 'https://api.openai-next.com/v1';
const KEY = 'sk-IYSE4I96nem6aCRe06FfBfE6420c492589E50510Eb6f25A5';

async function probe(name, url, opts) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    let brief = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      if (url.includes('/embeddings')) brief = `dims=${j.data?.[0]?.embedding?.length} model=${j.model} usage=${JSON.stringify(j.usage || {})}`;
      if (url.includes('/models')) brief = `count=${(j.data || []).length} sample=${(j.data || []).slice(0, 40).map((m) => m.id).join(',')}`;
      if (url.includes('audio/speech')) brief = `content-type=${j.error?.message || 'BINARY(' + text.length + ')'}`;
    } catch {}
    console.log(`\n[${name}] HTTP ${res.status} :: ${brief}`);
    return res.ok;
  } catch (e) { console.log(`\n[${name}] ERROR :: ${e.message}`); return false; }
}

const json = (body) => ({ method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

(async () => {
  await probe('models清单', `${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } });
  for (const m of ['text-embedding-3-small', 'text-embedding-3-large', 'bge-m3', 'qwen3-embedding']) {
    await probe(`embedding:${m}`, `${BASE}/embeddings`, json({ model: m, input: '科研文献向量化测试' }));
  }
  for (const m of ['rerank', 'bge-reranker-v2-m3', 'cohere-rerank']) {
    await probe(`rerank:${m}`, `${BASE}/rerank`, json({ model: m, query: 'test', documents: ['a', 'b'] }));
  }
  await probe('TTS:tts-1', `${BASE}/audio/speech`, json({ model: 'tts-1', input: '你好，这是一段论文朗读测试。', voice: 'alloy' }));
  await probe('TTS:tts-1-hd', `${BASE}/audio/speech`, json({ model: 'tts-1-hd', input: '你好', voice: 'nova' }));

  // 生成一个 0.5s 8kHz 正弦波 WAV 用于 ASR 端点探测
  const rate = 8000, dur = 4000, data = Buffer.alloc(dur * 2);
  for (let i = 0; i < dur; i++) data.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / rate)), i * 2);
  const wav = Buffer.concat([
    Buffer.from('RIFF'), u32(36 + data.length), Buffer.from('WAVEfmt '), u32(16), u16(1), u16(1), u32(rate), u32(rate * 2), u16(2), u16(16), Buffer.from('data'), u32(data.length), data,
  ]);
  for (const m of ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'sensevoice', 'qwen3-asr-flash', 'paraformer']) {
    const fd = new FormData();
    fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'test.wav');
    fd.append('model', m);
    await probe(`ASR:${m}`, `${BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd });
  }

  // 视觉理解探测：图片 URL 方式
  const img = 'https://www.gstatic.com/images/branding/glogo_light_color_PNG-128.png';
  for (const m of ['qwen3-vl-plus', 'gemini-2.5-pro', 'glm-4v', 'gpt-6.1-sol', 'doubao-seed-2-0-pro-260215']) {
    await probe(`vision:${m}`, `${BASE}/chat/completions`, json({
      model: m, max_tokens: 60,
      messages: [{ role: 'user', content: [{ type: 'text', text: '用一句话描述这张图片' }, { type: 'image_url', image_url: { url: img } }] }],
    }));
  }
})().then(() => console.log('\nDONE'));

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
