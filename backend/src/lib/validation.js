const { fail } = require('./respond');

// 契约里为面向用户的表单（登录/注册等）写了中文提示，这里挑出来放进 message，
// 避免前端只能看到一个空洞的「参数校验失败」；英文默认提示仍保留在 details 中供排查。
const CHINESE_TEXT = /[^\x00-\x7F]/;

function buildMessage(details) {
  const hint = details.map((detail) => detail.message).find((msg) => typeof msg === 'string' && CHINESE_TEXT.test(msg));
  return hint ? `参数校验失败：${hint}` : '参数校验失败';
}

function validate(schemas = {}) {
  return (req, res, next) => {
    for (const location of ['params', 'query', 'body']) {
      if (!schemas[location]) continue;
      const parsed = schemas[location].safeParse(req[location] ?? {});
      if (!parsed.success) {
        const details = parsed.error.issues.map((issue) => ({
          field: [location, ...issue.path].join('.'), message: issue.message,
        }));
        return fail(res, 400, 40011, buildMessage(details), details);
      }
      req[location] = parsed.data;
    }
    next();
  };
}

module.exports = { validate, buildMessage };
