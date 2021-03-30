const path = require('path')
const browserify = require('browserify')
const vfs = require('vinyl-fs')
const bifyAmdVinylPlugin = require('../src/plugin')

const sampleEntryFile = path.join(__dirname, 'example.js')
const distDir = path.join(__dirname, '..', 'dist')

const bundler = browserify([sampleEntryFile], {
  plugin: [bifyAmdVinylPlugin],
  // required options
  dedupe: false,
  fullPaths: true,
})

bundler.bundle()
  .pipe(vfs.dest(distDir))
