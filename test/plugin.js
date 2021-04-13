const path = require('path')
const { promisify } = require('util')
const test = require('ava')
const browserify = require('browserify')
const plugin = require('../src/plugin.js')

test('plugin - basic manifests', async (t) => {
  let manifestsResult
  const bundler = browserify([
    path.join(__dirname, 'fixtures', 'a.js'),
    path.join(__dirname, 'fixtures', 'b.js'),
  ], {
    ...plugin.args,
    plugin: [
      [
        plugin,
        {
          onDone: ({ manifests }) => {
            manifestsResult = manifests
          },
        },
      ],
    ],
  })

  await promisify((cb) => bundler.bundle(cb))()

  t.deepEqual(manifestsResult, new Map(Object.entries({
    'test/fixtures/a.js': new Set(['test/fixtures/a.js', 'test/fixtures/b.js', 'test/fixtures/c.js']),
    'test/fixtures/b.js': new Set(['test/fixtures/b.js', 'test/fixtures/c.js']),
  })))
})
