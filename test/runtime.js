require('../runtime')

main()

async function main () {
  gatorRuntime.defineModule('c', {}, (require,exports,module) => {
    module.exports = '123'
  })
  gatorRuntime.defineModule('b', {}, (require,exports,module) => {
    module.exports = 'abc'
  })
  gatorRuntime.defineModule('a', {b: 'b', c: 'c'}, (require,exports,module) => {
    console.log([require('b'),require('c')])
  })
  await gatorRuntime.ensureModuleLoaded('a')
  gatorRuntime.runModule('a')
}