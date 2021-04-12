const path = require('path')
const browserify = require('browserify')
const vfs = require('vinyl-fs')
const bifyVinylGatorPlugin = require('../src/plugin')

const sampleEntryFile = path.join(__dirname, 'example.js')
const distDir = path.join(__dirname, '..', 'dist')

const bundler = browserify([sampleEntryFile], {
  plugin: [bifyVinylGatorPlugin],
  // required options
  dedupe: false,
  fullPaths: true,
})

bundler.bundle()
  .pipe(vfs.dest(distDir))
