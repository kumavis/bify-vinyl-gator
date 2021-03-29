const fs = require('fs')
const path = require('path')
const through = require('through2')
const VinylFile = require('vinyl')

const requirejsPath = require.resolve('requirejs/require.js')
const bifyGlobalShimMap = {
  process: 'node_modules/process/browser',
  buffer: 'node_modules/buffer/index',
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
  const moduleDepMaps = {}
  const stream = through.obj(onModule, onDone)
  return stream

  function onModule (moduleData, _, next) {
    const relativePath = getRelativePath(projectDir, moduleData.file)
    // collect entry files
    if (moduleData.entry) {
      entryFiles.push(relativePath)
    }
    // create and record relative depMap
    const moduleDirName = path.dirname(relativePath)
    const relativeDepMap = createAmdConfigMap(projectDir, moduleDirName, moduleData.deps)
    moduleDepMaps[relativePath] = relativeDepMap
    // transform module into AMD and output as vinyl file
    const isGlobalShim = Object.values(bifyGlobalShimMap).includes(relativePath)
    const bifyGlobalShimNames = Object.keys(bifyGlobalShimMap)
    if (isGlobalShim) {
      // ensure we dont cyclic require ourselves (e.g. buffer)
      bifyGlobalShimNames.forEach(name => delete relativeDepMap[name])
    }
    const globalShimsToApply = isGlobalShim ? [] : bifyGlobalShimNames
    const cjsDepNames = Object.values(relativeDepMap)
    const transformedSource = transformCjsToAmd(moduleData.source, cjsDepNames, moduleData.entry, globalShimsToApply, moduleData)
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
    const runtimeContent = fs.readFileSync(requirejsPath)
    const runtimeFile = new VinylFile({
      cwd: projectDir,
      path: 'require.js',
      contents: runtimeContent,
    })
    stream.push(runtimeFile)
    // add a requirejs config file with module deps map
    const requirejsConfig = { map: moduleDepMaps }
    requirejsConfig.map['*'] = bifyGlobalShimMap
    requirejsConfig.nodeIdCompat = true
    const requirejsConfigObjContent = JSON.stringify(requirejsConfig, null, 2)
    const requirejsConfigContent = `requirejs.config(${requirejsConfigObjContent})`
    const requirejsConfigFile = new VinylFile({
      cwd: projectDir,
      path: '__config__.js',
      contents: Buffer.from(requirejsConfigContent, 'utf8'),
    })
    stream.push(requirejsConfigFile)
    // add an html entry point
    const entryFileScriptTags = entryFiles.map((filepath) => createScriptTag(filepath))
    const htmlContent = fs.readFileSync(__dirname + '/htmlTemplate.html', 'utf8')
      .split('{{entryFiles}}').join(entryFileScriptTags)
    const htmlFile = new VinylFile({
      cwd: projectDir,
      path: 'index.html',
      contents: Buffer.from(htmlContent, 'utf8'),
    })
    stream.push(htmlFile)
    // trigger end of stream
    stream.push(null)
  }

}

function createAmdConfigMap (projectDir, moduleRoot, bifyDepMap) {
  return Object.fromEntries(
    Object.entries(bifyDepMap)
      // ensure present
      .filter(([requestedName, maybeResolvedPath]) => Boolean(maybeResolvedPath))
      // rewrite resolved paths to relative path
      .map(([requestedName, resolvedPath]) => {
        // amd will resolve relative paths before checking the depMap, so we must modify the map key to match
        const resolvedRequestedPath = getDepMapResolvedPath(projectDir, moduleRoot, requestedName)
        const resultPath = getDepMapRelativePath(projectDir, resolvedPath)
        return [resolvedRequestedPath, resultPath]
      })
  )
}

function transformCjsToAmd (moduleSource, cjsDepNames, isEntry, globalShimNames, moduleData) {
  const cjsSystemImports = ['require', 'exports', 'module']
  const depsForAmd = [...cjsSystemImports, ...globalShimNames, ...cjsDepNames]
  const serializedDepsArray = JSON.stringify(depsForAmd, null, 2)
  const moduleDefinitionMethod = isEntry ? 'require' : 'define'
  // for debugging
  moduleSource = `//${JSON.stringify(moduleData.deps || {})}\n${moduleSource}`
  return `${moduleDefinitionMethod}(${serializedDepsArray}, function(require, exports, module){\n\n${moduleSource}\n\n})`
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