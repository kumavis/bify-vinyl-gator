const fs = require('fs')
const path = require('path')
const through = require('through2')
const VinylFile = require('vinyl')

const str = JSON.stringify

module.exports = plugin
module.exports.args = {
  dedupe: false,
  fullPaths: true,
}

function plugin (browserify, pluginOpts) {
  // setup the plugin in a re-bundle friendly way
  browserify.on('reset', setupPlugin)
  setupPlugin()

  function setupPlugin () {
    browserify.pipeline.get('pack').splice(0, 1, createPacker(pluginOpts))
  }
}

function createPacker ({
  projectDir = process.cwd(),
  includeHtml = true,
  includeStart = true,
}) {
  const entryFiles = []
  const stream = through.obj(onModule, onDone)
  return stream

  function onModule (moduleData, _, next) {
    const relativePath = path.relative(projectDir, moduleData.file)
    // collect entry files
    if (moduleData.entry) {
      entryFiles.push(relativePath)
    }
    // create and record relative depMap
    const relativeDepMap = createRelativeDepMap(projectDir, moduleData.deps)
    // transform module into gator format and output as vinyl file
    const transformedSource = createModuleDefinition(relativePath, moduleData.source, relativeDepMap)
    const moduleFile = new VinylFile({
      cwd: projectDir,
      path: moduleData.file,
      contents: Buffer.from(transformedSource, 'utf8'),
    })
    stream.push(moduleFile)
    next()
  }

  function onDone () {
    // add the requirejs gator runtime
    /* eslint-disable-next-line node/no-sync */
    const runtimeContent = fs.readFileSync(path.join(__dirname, 'runtime.js'))
    const runtimeFile = new VinylFile({
      cwd: projectDir,
      path: 'gator-runtime.js',
      contents: runtimeContent,
    })
    stream.push(runtimeFile)
    // add the entrypoint callers
    if (includeStart) {
      /* eslint-disable-next-line node/no-sync */
      const startContent = fs.readFileSync(path.join(__dirname, 'start.js.template'), 'utf8')
        .split('{{entryFiles}}').join(str(entryFiles))
      const startFile = new VinylFile({
        cwd: projectDir,
        path: '__start.js__',
        contents: Buffer.from(startContent, 'utf8'),
      })
      stream.push(startFile)
    }
    // add an html entry point
    if (includeHtml) {
      /* eslint-disable-next-line node/no-sync */
      const htmlContent = fs.readFileSync(path.join(__dirname, 'htmlManifest.html'))
      const htmlFile = new VinylFile({
        cwd: projectDir,
        path: 'index.html',
        contents: htmlContent,
      })
      stream.push(htmlFile)
    }
    // trigger end of stream
    stream.push(null)
  }

}

function createRelativeDepMap (projectDir, bifyDepMap) {
  return Object.fromEntries(
    Object.entries(bifyDepMap)
      // ensure present
      .filter(([_, maybeResolvedPath]) => Boolean(maybeResolvedPath))
      // rewrite resolved paths to relative path
      .map(([requestedName, resolvedPath]) => {
        return [requestedName, path.relative(projectDir, resolvedPath)]
      }),
  )
}

function createModuleDefinition (moduleId, moduleSource, relativeDepMap) {
  return `gatorRuntime.defineModule(${str(moduleId)}, ${str(relativeDepMap)}, function(require, exports, module){\n\n${moduleSource}\n\n})`
}
