const fs = require('fs')
const path = require('path')
const through = require('through2')
const VinylFile = require('vinyl')
const str = JSON.stringify


const bifyGlobalShimMap = {
  process: 'node_modules/process/browser.js',
  buffer: 'node_modules/buffer/index.js',
}

module.exports = plugin

function plugin (browserify, pluginOpts) {
  const projectDir = pluginOpts.projectDir || process.cwd()
  // setup the plugin in a re-bundle friendly way
  browserify.on('reset', setupPlugin)
  setupPlugin()
  return

  function setupPlugin () {
    browserify.pipeline.get('pack').splice(0, 1, createPacker({ projectDir }))
  }
}

function createPacker ({ projectDir }) {
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
    const moduleDirName = path.dirname(relativePath)
    const relativeDepMap = createRelativeDepMap(projectDir, moduleData.file, moduleData.deps)
    // transform module into AMD and output as vinyl file
    const isGlobalShim = Object.values(bifyGlobalShimMap).includes(relativePath)
    const bifyGlobalShimNames = Object.keys(bifyGlobalShimMap)
    const globalShimsToApply = isGlobalShim ? [] : bifyGlobalShimNames
    const cjsDepNames = Object.values(relativeDepMap)
    const transformedSource = createModuleDefinition(relativePath, moduleData.source, globalShimsToApply, cjsDepNames, relativeDepMap)
    const moduleFile = new VinylFile({
      cwd: projectDir,
      path: moduleData.file,
      contents: Buffer.from(transformedSource, 'utf8'),
    })
    stream.push(moduleFile)
    next()
  }

  function onDone () {
    // add the requirejs amd runtime
    const runtimeContent = fs.readFileSync(__dirname + '/runtime.js')
    const runtimeFile = new VinylFile({
      cwd: projectDir,
      path: '__runtime__.js',
      contents: runtimeContent,
    })
    stream.push(runtimeFile)
    // add the entrypoint callers
    const startContent = fs.readFileSync(__dirname + '/start.js', 'utf8')
      .split('{{entryFiles}}').join(str(entryFiles))
    const startFile = new VinylFile({
      cwd: projectDir,
      path: '__start__.js',
      contents: Buffer.from(startContent, 'utf8'),
    })
    stream.push(startFile)
    // add an html entry point
    const entryFileScriptTags = entryFiles.map((filepath) => createScriptTag(filepath))
    const htmlContent = fs.readFileSync(__dirname + '/htmlTemplate.html')
    const htmlFile = new VinylFile({
      cwd: projectDir,
      path: 'index.html',
      contents: htmlContent,
    })
    stream.push(htmlFile)
    // trigger end of stream
    stream.push(null)
  }

}

function createRelativeDepMap (projectDir, moduleId, bifyDepMap) {
  return Object.fromEntries(
    Object.entries(bifyDepMap)
      // ensure present
      .filter(([requestedName, maybeResolvedPath]) => Boolean(maybeResolvedPath))
      // rewrite resolved paths to relative path
      .map(([requestedName, resolvedPath]) => {
        return [requestedName, path.relative(projectDir, resolvedPath)]
      })
  )
}

function createModuleDefinition (moduleId, moduleSource, globalShimNames, cjsDepNames, relativeDepMap) {
  const depsForAmd = [...globalShimNames, ...cjsDepNames]
  const serializedDepsArray = str(depsForAmd, null, 2)
  return `gatorRuntime.defineModule(${str(moduleId)}, ${str(relativeDepMap)}, function(require, exports, module){\n\n${moduleSource}\n\n})`
}

function getDepMapResolvedPath (projectDir, fromPath, toPath) {
  // only resolve if explicitly absolute or relative  
  if (!toPath.startsWith(path.sep) && !toPath.startsWith('.')) {
    return toPath
  }
  const fullResolvedPath = path.resolve(fromPath, toPath)
  const relativeResolved = path.relative(projectDir, fullResolvedPath)
  return removeExtension(relativeResolved)
}

function getDepMapRelativePath (fromPath, toPath) {
  const relative = getRelativePath(fromPath, toPath)
  return removeExtension(relative)
}

function removeExtension (filepath) {
  // amd doesnt like the extension present (omfg)
  if (!filepath.includes('.js')) {
    return filepath
  }
  return filepath.slice(0, filepath.indexOf(path.extname(filepath)))
}

function getRelativePath (fromPath, toPath) {
  let result = path.relative(fromPath, toPath)
  return result
  // i thought this was a good idea, maybe not bc amd tries to normalize

  // // ensure path starts with './' or '../'
  // if (result.startsWith(`..${path.sep}`)) return result
  // return `.${path.sep}${result}`
}

function createScriptTag (src) {
  return `<script type="text/javascript" src="./${src}"></script>`
}