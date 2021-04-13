const fs = require('fs')
const path = require('path')
const through = require('through2')
const VinylFile = require('vinyl')

const str = JSON.stringify
/* eslint-disable-next-line no-empty-function */
const noop = () => {}

module.exports = plugin
module.exports.args = {
  dedupe: false,
  fullPaths: true,
}

const supportedArgs = ['onDone', 'projectDir', 'includeHtml', 'includeStart']

function plugin (browserify, pluginOpts) {
  const unknownArgs = Object.keys(pluginOpts).filter((arg) => !supportedArgs.includes(arg))
  if (unknownArgs.length) {
    throw new Error(`bify-vinyl-gator - unknown args "${unknownArgs}"`)
  }

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
  onDone = noop,
}) {
  const entryFiles = []
  const depMaps = new Map()
  const stream = through.obj(inspectModule, afterLastModule)
  return stream

  function inspectModule (moduleData, _, next) {
    const relativePath = path.relative(projectDir, moduleData.file)
    // collect entry files
    if (moduleData.entry) {
      entryFiles.push(relativePath)
    }
    // create and record relative depMap
    const relativeDepMap = createRelativeDepMap(projectDir, moduleData.deps)
    depMaps.set(relativePath, relativeDepMap)
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

  function afterLastModule () {
    // now that we're done we can walk the dep graph
    // to determine the manifests for each entry
    const manifests = getManifestForEntries({ entryFiles, depMaps })
    // allow plugin consumer to inspect metadata)
    onDone({ entryFiles, depMaps, manifests })
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

function getManifestForEntries ({ entryFiles, depMaps }) {
  const result = new Map()
  const cache = new Map()
  for (const entryFile of entryFiles) {
    const manifest = new Set(getManifestForEntry(entryFile, depMaps, cache))
    result.set(entryFile, manifest)
  }
  return result
}

function getManifestForEntry (target, depMaps, cache, visited = new Set()) {
  if (visited.has(target)) {
    return []
  }
  if (cache.has(target)) {
    return cache.get(target)
  }
  visited.add(target)
  const children = Object.values(depMaps.get(target) || {})
  const childEntries = children.map((child) => {
    return getManifestForEntry(child, depMaps, cache, visited)
  }).flat()
  return [target, ...childEntries]
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
