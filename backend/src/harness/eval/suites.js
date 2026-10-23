const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { getConfig } = require('./config');
const { version: promptVersion } = require('../../ai/prompts');

const caseSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[\w-]+$/),
  question: z.string().trim().min(1).max(2000),
  scene: z.enum(['workbench', 'document']).default('workbench'),
  expected: z.array(z.string().trim().min(1).max(300)).min(1).max(10)
    .refine((items) => new Set(items).size === items.length, 'expected 不能重复'),
  minimum: z.number().min(0).max(1).default(0.66),
}).strict();

class SuiteError extends Error {
  constructor(message, code = 'SUITE_INVALID') {
    super(message);
    this.name = 'SuiteError';
    this.code = code;
  }
}

function validateAndCompileCases(rawCases, maxCases) {
  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    throw new SuiteError('套件用例不能为空且必须是数组');
  }
  if (rawCases.length > maxCases) {
    throw new SuiteError(`用例数量超过上限 ${maxCases}`);
  }

  const seenIds = new Set();
  const cases = [];

  for (const raw of rawCases) {
    const parsed = caseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new SuiteError(`用例校验失败: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }
    const item = parsed.data;
    if (seenIds.has(item.id)) {
      throw new SuiteError(`用例 ID 重复: ${item.id}`);
    }
    seenIds.add(item.id);

    // 预编译正则校验
    for (const pattern of item.expected) {
      try {
        new RegExp(pattern, 'i');
      } catch (err) {
        throw new SuiteError(`用例 ${item.id} 正则表达式非法: ${pattern}`);
      }
    }

    cases.push({
      ...item,
      redline: item.minimum === 1,
    });
  }

  return cases;
}

let suiteCache = null;

function loadAllSuites() {
  const config = getConfig();
  const suites = new Map();

  // 1. 加载 core 套件（直接读取 backend/eval/cases.json）
  const corePath = path.resolve(__dirname, '../../../eval/cases.json');
  if (!fs.existsSync(corePath)) {
    throw new SuiteError(`核心用例文件不存在: ${corePath}`);
  }
  const coreCasesRaw = JSON.parse(fs.readFileSync(corePath, 'utf8'));
  const coreCases = validateAndCompileCases(coreCasesRaw, config.maxCases);

  const coreSuite = {
    id: 'core',
    name: '核心科研回答质量',
    version: '2026-10-23.v1',
    description: '复用现有 12 条科研回答用例，覆盖实验设计、文献综述、拒答诚实与写作约束',
    source: 'backend/eval/cases.json',
    modes: ['template', 'live'],
    scorer: 'regex-hit-v1',
    prompt_version: promptVersion,
    cases: coreCases,
    case_count: coreCases.length,
    redline_count: coreCases.filter((c) => c.redline).length,
  };
  suites.set('core', coreSuite);

  // 2. 加载可选套件目录
  const suiteDir = path.resolve(config.suiteDir);
  if (fs.existsSync(suiteDir) && fs.statSync(suiteDir).isDirectory()) {
    const files = fs.readdirSync(suiteDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const filePath = path.join(suiteDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!data || typeof data !== 'object') continue;
        if (!data.id || typeof data.id !== 'string') {
          throw new SuiteError(`套件文件 ${file} 缺少合法 id`);
        }
        if (suites.has(data.id)) {
          throw new SuiteError(`套件 ID 重复: ${data.id}`);
        }
        const cases = validateAndCompileCases(data.cases, config.maxCases);
        const customSuite = {
          id: data.id,
          name: data.name || data.id,
          version: data.version || '1.0',
          description: data.description || '',
          source: path.relative(path.resolve(__dirname, '../../../../'), filePath).replace(/\\/g, '/'),
          modes: ['template', 'live'],
          scorer: 'regex-hit-v1',
          prompt_version: promptVersion,
          cases,
          case_count: cases.length,
          redline_count: cases.filter((c) => c.redline).length,
        };
        suites.set(customSuite.id, customSuite);
      } catch (err) {
        throw new SuiteError(`可选套件加载失败 [${file}]: ${err.message}`);
      }
    }
  }

  return suites;
}

function getCache() {
  if (!suiteCache) {
    suiteCache = loadAllSuites();
  }
  return suiteCache;
}

function clearCache() {
  suiteCache = null;
}

function listSuites() {
  const cache = getCache();
  const items = [];
  for (const s of cache.values()) {
    items.push({
      id: s.id,
      name: s.name,
      version: s.version,
      description: s.description,
      case_count: s.case_count,
      redline_count: s.redline_count,
      source: s.source,
      modes: s.modes,
    });
  }
  return items;
}

function getSuite(id) {
  const cache = getCache();
  const s = cache.get(id);
  if (!s) {
    throw new SuiteError(`套件不存在: ${id}`, 'SUITE_NOT_FOUND');
  }
  return s;
}

module.exports = {
  SuiteError,
  caseSchema,
  listSuites,
  getSuite,
  clearCache,
};
