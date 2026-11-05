const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');

function load(fetch) {
  const context = {
    window: { dbAll: async () => [], dbPut() {}, dbDelete() {} },
    document: { createElement: () => ({}), head: { appendChild() {} }, getElementById: () => null },
    console, fetch, Blob, FormData, Uint8Array, atob, crypto: webcrypto,
    AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: () => null },
    alert: message => { throw Error(message); }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../cloud.js'), 'utf8'), context);
  return context.window;
}
const json = value => new Response(JSON.stringify(value), { status: 200 });

test('concurrent gallery reads sign all paths once; uploads use multipart then save metadata', async () => {
  const calls = [];
  const api = load(async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/object/sign/')) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.paths, ['existing.png', 'other.jpg']);
      return json(body.paths.map(path => ({ path, signedURL: '/object/sign/' + path })));
    }
    if (url.includes('/storage/v1/object/')) {
      assert.ok(options.body instanceof FormData);
      assert.equal(options.headers['Content-Type'], undefined);
      assert.equal(options.body.get('cacheControl'), '3600');
      const file = options.body.get('');
      assert.equal(file.type, 'image/png');
      assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [1, 2, 3]);
      return json({ Key: 'uploaded.png' });
    }
    if (options.method === 'POST') return new Response(null, { status: 201 });
    return json([
      { id: 'old', storage_path: 'existing.png' },
      { id: 'other', storage_path: 'other.jpg' }
    ]);
  });
  const [first, second] = await Promise.all([api.dbAll(), api.dbAll()]);
  assert.equal(first, second);
  assert.equal(calls.length, 2);
  assert.match(first[0].image, /\/storage\/v1\/object\/sign\/existing.png$/);
  await api.dbPut({ image: 'data:image/png;base64,AQID', kind: 'renders', room: 'כללי' });
  const writes = calls.filter(c => c.options.method === 'POST');
  assert.match(writes[1].url, /\/storage\/v1\/object\/renovation-images\//);
  assert.match(writes[2].url, /\/rest\/v1\/renovation_media/);
  assert.equal(JSON.parse(writes[2].options.body).kind, 'renders');
});

test('Storage errors are reported and do not create a gallery record', async () => {
  let metadataWrites = 0;
  const api = load(async (url, options = {}) => {
    if (url.includes('/storage/')) return new Response('Storage rejected upload', { status: 400 });
    if (options.method === 'POST') metadataWrites++;
    return json([]);
  });
  await api.dbAll();
  await assert.rejects(api.dbPut({ image: 'data:image/png;base64,AQID' }), /Supabase HTTP 400: Storage rejected upload/);
  assert.equal(metadataWrites, 0);
});
