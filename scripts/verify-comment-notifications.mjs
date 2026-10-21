// Offline action boundary checks; no database or email delivery.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(file, dependencies) {
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  });
  return exports;
}
function harness({ selected = 'ppb2026', user = { email: 'reader@un.org', entity: 'OCHA' }, rows = [] } = {}) {
  const calls = [], cookies = [];
  const tx = async (sql, params) => { calls.push({ sql, params }); return rows; };
  const actions = load('src/features/mandates/actions/comment-notifications.ts', {
    '@/features/auth/auth': { getCurrentUser: async () => user },
    '@/lib/db/db': { transaction: async (fn, cycle) => { calls.push({ cycle }); return fn(tx); } },
    '@/lib/db/review-cycle': {
      getBudgetVersion: async () => selected,
      parseBudgetVersion: cycle => { assert.ok(['ppb2026','ppb2027'].includes(cycle)); return cycle; },
      REVIEW_CYCLE_COOKIE: 'review-cycle',
    },
    'next/headers': { cookies: async () => ({ set: (...args) => cookies.push(args) }) },
    'next/navigation': { redirect: url => { throw new Error(`redirect:${url}`); } },
    '@/features/mandates/services/comment-notifications': {},
  });
  return { actions, calls, cookies };
}
const commentId = '00000000-0000-0000-0000-000000000001';

test('stale-page read receipt is rejected before acquiring a database transaction', async () => {
  const { actions, calls } = harness();
  assert.equal((await actions.markCommentsReadAction([commentId], 'ppb2027')).success, false);
  assert.deepEqual(calls, []);
});
test('personal read receipts work on archived cycles, only for exact supplied IDs', async () => {
  const { actions, calls } = harness();
  assert.equal((await actions.markCommentsReadAction([commentId, commentId], 'ppb2026')).success, true);
  const insert = calls.find(call => call.sql?.includes('INSERT INTO'));
  assert.deepEqual(insert.params, ['reader@un.org', [commentId], 'ppb2026']);
  assert.match(insert.sql, /c\.id = ANY\(\$2::uuid\[\]\)/);
  assert.match(insert.sql, /c\.budget_version = \$3/);
  assert.match(insert.sql, /ON CONFLICT[\s\S]*DO NOTHING/);
  assert.ok(calls.some(call => call.sql?.includes("set_config('app.user_email'")));
});
test('unauthenticated readers cannot create read receipts', async () => {
  const { actions, calls } = harness({ user: null });
  assert.equal((await actions.markCommentsReadAction([commentId], 'ppb2026')).success, false);
  assert.equal(calls.filter(call => call.sql).length, 0);
});
test('notification opens stored context in its cycle without marking anything read', async () => {
  const { actions, calls, cookies } = harness({ rows: [{ entity: 'OCHA', document_symbol: 'A/RES/80/111', subprogramme: '3' }] });
  await assert.rejects(actions.openCommentNotificationAction(commentId, 'ppb2027'), error => {
    const url = new URL(error.message.slice('redirect:'.length), 'http://localhost');
    assert.equal(url.pathname, '/entity/OCHA');
    assert.equal(url.searchParams.get('comment'), commentId);
    assert.equal(url.searchParams.get('document'), 'A/RES/80/111');
    assert.equal(url.searchParams.get('subprogramme'), '3');
    assert.equal(url.searchParams.get('cycle'), 'ppb2027');
    return true;
  });
  assert.equal(cookies[0][1], 'ppb2027');
  assert.ok(calls.some(call => call.cycle === 'ppb2027'));
  assert.equal(calls.filter(call => /INSERT|UPDATE/.test(call.sql ?? '')).length, 0);
});
