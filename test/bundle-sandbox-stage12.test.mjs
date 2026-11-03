// Test harness only. node:vm/node:test are NOT imported by npm run bundle.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
async function sandbox({ realNetwork = false } = {}) {
  const calls = [], imports = new Set(), output = [];
  const sandboxProcess = { env: process.env, stdout: { write: value => output.push(value) },
    stderr: { write: value => output.push(value) }, exitCode: 0 };
  const context = vm.createContext({ process: sandboxProcess, fetch: async (target, options = {}) => {
    const address = new url.URL(target);
    assert.equal(address.protocol, 'https:');
    assert.match(address.hostname, /\.vercel\.app$/u);
    assert.ok(['GET', 'HEAD'].includes(options.method ?? 'GET'), 'write must never reach fetch');
    assert.equal(options.signal, undefined);
    calls.push({ method: options.method, route: address.pathname });
    if (realNetwork) return fetch(target, options);
    const status = address.pathname === '/data.json' ? 404
      : address.pathname.startsWith('/api/') ? 401 : 200;
    return { status, ok: status >= 200 && status < 300, text: async () => '/api/notes',
      json: async () => address.pathname === '/aleph.json'
        ? { step: 12, repoUrl: 'https://github.com/Ryu-Taehyun/choi-bujang-secret-vault', commit: 'a'.repeat(40) }
        : { notes: [] } };
  } });
  // Deliberately no AbortSignal, timers, Buffer or other Node globals.
  const modules = new Map();
  const allowed = {
    'node:fs': fs, 'node:path': path, 'node:url': url,
    'node:crypto': { createHash(algorithm, ...options) {
      assert.equal(algorithm, 'sha256'); return createHash(algorithm, ...options);
    }, randomUUID },
    'node:child_process': { execFileSync(command, args, options) {
      assert.equal(command, 'git');
      const commandIndex = args[0] === '-C' ? 2 : 0;
      assert.ok(['status', 'rev-parse', 'config', 'remote', 'diff-tree', 'show'].includes(args[commandIndex]));
      if (args[commandIndex] === 'config') assert.ok(args.includes('--get'));
      if (args[commandIndex] === 'remote') assert.equal(args[commandIndex + 1], 'get-url');
      return execFileSync(command, args, options);
    } },
  };
  async function load(specifier, parent = url.pathToFileURL(root + path.sep).href) {
    const id = specifier.startsWith('node:') ? specifier : new url.URL(specifier, parent).href;
    if (modules.has(id)) return modules.get(id);
    let mod;
    if (id.startsWith('node:')) {
      imports.add(id); assert.ok(Object.hasOwn(allowed, id), `unsupported module ${id}`);
      const entries = allowed[id], names = Object.keys(entries);
      mod = new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, entries[name]); }, { context, identifier: id });
    } else {
      const file = url.fileURLToPath(id);
      assert.ok(file.startsWith(root + path.sep), 'local module must stay within repository');
      mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: id,
        initializeImportMeta(meta) { meta.dirname = path.dirname(file); meta.url = id; },
        importModuleDynamically: async (child, owner) => {
          const target = await load(child, owner.identifier);
          if (target.status === 'unlinked') await target.link((next, owner) => load(next, owner.identifier));
          if (target.status === 'linked') await target.evaluate();
          return target;
        },
      });
    }
    modules.set(id, mod); return mod;
  }
  return { calls, imports, output, sandboxProcess, async run(file) {
    const mod = await load(url.pathToFileURL(path.join(root, file)).href);
    await mod.link((child, parent) => load(child, parent.identifier));
    await mod.evaluate(); return mod.namespace;
  } };
}
test('12단계 자기 점검은 GET만 보내고 PUT 두 항목은 정확히 not_run이다', async () => {
  const runner = await sandbox(); const { runAttackChecks } = await runner.run('src/attack-check.mjs');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'aleph.config.json'), 'utf8'));
  const attempts = await runAttackChecks(config);
  assert.equal(attempts.length, 9); assert.equal(runner.calls.length, 7);
  assert.equal(attempts.find(item => item.attackId === 'announcement_write_rejection').observed, 'not_run');
  assert.equal(attempts.find(item => item.attackId === 'anonymous_admin_rejection').observed, 'not_run');
  assert.equal(runner.calls.every(call => call.method === 'GET'), true);
});
test('이전 2단계 POST 점검도 네트워크 호출 없이 not_run이다', async () => {
  const runner = await sandbox(); const { runAttackChecks } = await runner.run('src/attack-check.mjs');
  const attempts = await runAttackChecks({ step: 2, publicAppUrl: 'https://vault-fixture.vercel.app/', repoUrl: 'https://github.com/fixture/vault' });
  assert.equal(attempts.find(item => item.attackId === 'api_method_rejection').observed, 'not_run');
  assert.equal(runner.calls.length, 4);
});
test('전체 bundle은 허용 모듈·읽기 전용 git·GET만으로 JSON 생성까지 끝난다 (커밋 후)', async () => {
  const runner = await sandbox(); await runner.run('scripts/bundle.mjs');
  assert.equal(runner.sandboxProcess.exitCode, 0, runner.output.join(''));
  assert.equal(runner.calls.length, 7);
  assert.equal([...runner.imports].every(name => ['node:fs','node:path','node:url','node:crypto','node:child_process'].includes(name)), true);
  const bundle = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/submission.json'), 'utf8'));
  assert.equal(bundle.attackAttempts.filter(item => item.observed === 'not_run').length, 2);
  // This test uses synthetic HTTP responses. The final deliverable must be
  // regenerated by npm run bundle with actual HTTPS requests after this test.
});
