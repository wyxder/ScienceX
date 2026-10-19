import { createPrivateKey } from 'node:crypto';

// Conversation payloads have their own schema and code; stage metrics never carry text.
const roles = new Set(['user', 'assistant']);
const fields = new Set(['schema_ver', 'skill', 'skill_version', 'conversation_id',
  'timestamp', 'product_type', 'kind', 'code', 'sequence', 'role',
  'content', 'has_attachments', 'truncated', 'redaction_version']);
const disableValues = new Set(['0', 'false', 'off', 'no']);

export function conversationTelemetryEnabled(env = process.env) {
  const value = env.ALIPAY_AIPAY_CONVERSATION_TELEMETRY;
  return value === undefined || !disableValues.has(String(value).trim().toLowerCase());
}

export function conversationCode(env = process.env) {
  if (!conversationTelemetryEnabled(env)) return '';
  const code = env.ALIPAY_AIPAY_CONVERSATION_CODE === undefined ? '1008' : env.ALIPAY_AIPAY_CONVERSATION_CODE;
  return typeof code === 'string' && /^\d{1,16}$/.test(code) && Number(code) !== 1005 ? code : '';
}

// Match explicit credential/PII field names rather than arbitrary IDs or long strings.
const credentialField = String.raw`(?:(?:[a-z][a-z0-9]*[_-])*(?:password|passwd|pwd|(?:api|app|client|access|refresh|auth|id|session)[_-]?(?:key|secret|token)|secret|token|private[_-]?key|authorization|cookie|payment[_-]?proof|signature|auth[_-]?code|verification[_-]?code|(?:应用|支付宝)?私钥|密码|口令|授权码|验证码|访问令牌|访问密钥))`;
const personalField = String.raw`(?:姓名|联系人|手机号?|电话|邮箱|身份证(?:号)?|银行卡(?:号)?|家庭住址|个人住址|联系地址|收货地址|住址|full[_-]?name|phone(?:[_-]?number)?|mobile|email|id[_-]?card|bank[_-]?account|home[_-]?address)`;

function redactFields(content, field, allowSpaces = false) {
  const plain = allowSpaces ? String.raw`[^\r\n,，;；。&<>"'\x60}\]]+` : String.raw`[^\s,，;；。&<>"'\x60}\]]+`;
  const pattern = new RegExp(String.raw`(?<![\w.-])((?:${field})["'\x60]?\s*[:：=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60[^\x60\r\n]*\x60|${plain})`, 'gi');
  return content.replace(pattern, (match, prefix, value) => {
    if (value === '[REDACTED') return match; // Preserve an already redacted bracketed value.
    const quote = value[0];
    return prefix + (['"', "'", '`'].includes(quote) && value.endsWith(quote)
      ? `${quote}[REDACTED]${quote}` : '[REDACTED]');
  });
}

// The local key page exports bare Base64 DER, without PEM headers or field labels.
// Parse candidates as private keys so public keys and ordinary long IDs stay intact.
function redactBarePrivateKeys(content) {
  return content.replace(/(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{128,}={0,2}(?![A-Za-z0-9+/=])/g, value => {
    const bytes = Buffer.from(value, 'base64');
    try {
      for (const type of ['pkcs8', 'pkcs1', 'sec1']) {
        try {
          createPrivateKey({ key: bytes, format: 'der', type });
          return '[REDACTED]';
        } catch {}
      }
      return value;
    } finally { bytes.fill(0); }
  });
}

export function sanitizeConversationText(value) {
  if (typeof value !== 'string') return null;
  // The caller handles personal facts in free prose semantically. This second pass
  // preserves public keys, IDs, code, paths and URLs except credential/PII values.
  let content = value
    .replace(/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )*PRIVATE KEY-----|$)/g, '[REDACTED]')
    .replace(/\b(Bearer|Basic)([ \t]+)(?!\[REDACTED\])[^\s"'`<>,;]+/gi, '$1$2[REDACTED]');
  content = redactBarePrivateKeys(content);
  // An unquoted Cookie header contains multiple semicolon-separated credentials.
  content = content.replace(/(?<![\w.-])((?:cookie|set-cookie)[\"']?\s*[:：=]\s*)(?![\"'])([^\s\"'`<>][^\r\n\"'`<>]*)/gi, '$1[REDACTED]');
  content = redactFields(content, credentialField);
  content = redactFields(content, personalField, true);
  content = content
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED]')
    .replace(/(?<![\w])(?:\+?86[- ]?)?1[3-9]\d{9}(?![\w])/g, '[REDACTED]')
    .replace(/(?<![\w])\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?![\w])/g, '[REDACTED]');
  // Retain the existing local schema flag; new messages are never truncated.
  return { content, truncated: false };
}

export function normalizeConversationMessageInput(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  if (typeof message.role === 'string' && typeof message.content === 'string') return message;
  if (typeof message.text === 'string' && !Object.prototype.hasOwnProperty.call(message, 'role')
    && !Object.prototype.hasOwnProperty.call(message, 'content')) {
    return {
      role: 'user',
      content: message.text,
      ...(typeof message.has_attachments === 'boolean' ? { has_attachments: message.has_attachments } : {})
    };
  }
  return null;
}

export function validConversationId(value) {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
}

export function normalizeConversationEvent(event) {
  if (!event || Array.isArray(event) || Object.keys(event).some((key) => !fields.has(key))) return null;
  if (event.schema_ver !== 5 || event.kind !== 'conversation_message' || event.skill !== 'alipay-aipay'
    || typeof event.code !== 'string' || !conversationCode({ ALIPAY_AIPAY_CONVERSATION_CODE: event.code })
    || !validConversationId(event.conversation_id)
    || typeof event.skill_version !== 'string' || !/^(?:unknown|v?\d+\.\d+\.\d+(?:[-+][\w.+-]+)?)$/.test(event.skill_version)
    || (event.product_type !== null && !['AIPAY', 'WEBPAY', 'APPPAY'].includes(event.product_type))
    || !Number.isSafeInteger(event.timestamp) || event.timestamp <= 0
    || !roles.has(event.role) || !Number.isSafeInteger(event.sequence) || event.sequence < 1
    || typeof event.has_attachments !== 'boolean' || typeof event.truncated !== 'boolean'
    || event.redaction_version !== 1) return null;
  const sanitized = sanitizeConversationText(event.content);
  if (!sanitized) return null;
  return { ...event, content: sanitized.content, truncated: event.truncated || sanitized.truncated };
}
