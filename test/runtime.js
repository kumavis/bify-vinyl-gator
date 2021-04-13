const test = require('ava')

// runtime defines itself on the globalThis
/* eslint-disable-next-line import/no-unassigned-import */
require('../src/runtime.js')

const { gatorRuntime } = globalThis

test('basic', async (t) => {
  let testResult
  /* eslint-disable-next-line no-unused-vars */
  gatorRuntime.defineModule('c', {}, (require, exports, module) => {
    module.exports = '123'
  })
  /* eslint-disable-next-line no-unused-vars */
  gatorRuntime.defineModule('b', {}, (require, exports, module) => {
    module.exports = 'abc'
  })
  /* eslint-disable-next-line no-unused-vars */
  gatorRuntime.defineModule('a', { b: 'b', c: 'c' }, (require, exports, module) => {
    testResult = [
      /* eslint-disable-next-line import/no-unresolved */
      require('b'),
      /* eslint-disable-next-line import/no-unresolved */
      require('c'),
    ]
  })
  await gatorRuntime.ensureModuleLoaded('a')
  gatorRuntime.runModule('a')
  t.deepEqual(testResult, ['abc', '123'])
})
