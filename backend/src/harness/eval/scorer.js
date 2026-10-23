/**
 * 评分器：regex-hit-v1
 * 期望要点正则命中率；纯函数，不等价于事实正确性或完整人工评审。
 */
function score(text, expected) {
  if (!Array.isArray(expected) || expected.length === 0) {
    throw new Error('expected 必须是非空数组');
  }
  const content = text == null ? '' : String(text);
  const hits = expected.filter((pattern) => new RegExp(pattern, 'i').test(content));
  return {
    score: hits.length / expected.length,
    matched: hits,
    missing: expected.filter((pattern) => !hits.includes(pattern)),
  };
}

module.exports = {
  score,
};
