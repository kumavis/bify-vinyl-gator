const browserify = require('browserify')
const vfs = require('vinyl-fs')
const bifyAmdVinylPlugin = require('./index.js')

const sampleEntryFile = './example.js'

const bundler = browserify([sampleEntryFile], {
  plugin: [bifyAmdVinylPlugin],
  // required options
  dedupe: false,
  fullPaths: true,
})

bundler.bundle()
  .pipe(vfs.dest(__dirname + '/dist'))