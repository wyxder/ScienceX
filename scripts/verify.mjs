#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const quick = process.argv.includes('--quick');
const results = [];

function record(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function run(name, command, args, cwd) {
    console.log(`\n▶ ${name}\n  $ ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, { cwd, shell: process.platform === 'win32', stdio: 'inherit' });
    record(name, result.status === 0, result.status === 0 ? '通过' : `退出码 ${result.status}`);
    return result.status === 0;
}

console.log('ScienceX 交付复现校验');

const major = Number(process.versions.node.split('.')[0]);
record('Node.js 版本 ≥ 18', major >= 18, `当前 v${process.versions.node}`);

const backend = resolve(root, 'backend');
const frontend = resolve(root, 'frontend');
const hasBackendDeps = existsSync(resolve(backend, 'node_modules'));
const hasFrontendDeps = existsSync(resolve(frontend, 'node_modules'));
record('后端依赖已安装', hasBackendDeps, hasBackendDeps ? 'backend/node_modules' : '请先执行 cd backend && npm install');
record('前端依赖已安装', hasFrontendDeps, hasFrontendDeps ? 'frontend/node_modules' : '请先执行 cd frontend && npm install');

if (hasBackendDeps) run('后端自动化测试（74 条）', 'npm', ['test'], backend);
if (hasFrontendDeps) {
    run('前端类型检查', 'npm', ['run', 'typecheck'], frontend);
    if (!quick) run('前端生产构建', 'npm', ['run', 'build'], frontend);
}

const failed = results.filter((item) => !item.ok);
console.log(`\n校验汇总：${results.length - failed.length}/${results.length} 项通过${quick ? '（快速模式已跳过构建）' : ''}`);
if (failed.length) {
    console.log(`未通过：${failed.map((item) => item.name).join('、')}`);
    process.exit(1);
}
console.log('全部通过，可按 README 第五节启动前后端进行人工验收。');