(function () {

  // contains the module initializer
  const moduleRegistry = new Map()
  // contains the module exports
  const moduleCache = new Map()
  // promise for when the module has been registered
  const moduleRegistryQueue = new Map()

  const gatorRuntime = Object.freeze({
    debug: {
      moduleRegistry,
      moduleCache,
      moduleRegistryQueue,
    },
    defineModule (moduleId, depMap, moduleInitializer) {
      // ensure no overwrites
      if (moduleRegistry.has(moduleId)) {
        throw new Error(`gator-runtime: module already defined "${moduleId}"`)
      }
      // add to registry
      const moduleEntry = { depMap, moduleInitializer, isInitialized: false }
      moduleRegistry.set(moduleId, moduleEntry)
      // mark registry queue as completed
      if (moduleRegistryQueue.has(moduleId)) {
        const { resolve } = moduleRegistryQueue.get(moduleId)
        resolve(moduleEntry)
      }
      // queue loading of all deps
      // disabling cuz we're manually adding scripts to DOM
      // Object.values(depMap).filter(Boolean).forEach((entry) => gatorRuntime.requestModule(entry))
    },
    requestModule (moduleId) {
      // if already registered, skip
      if (moduleRegistry.has(moduleId)) {
        return
      }
      // if already loading, skip
      if (moduleRegistryQueue.has(moduleId)) {
        return
      }
      // start loading
      _loadModule(moduleId)
      const { promise, resolve } = deferred()
      moduleRegistryQueue.set(moduleId, { promise, resolve })
    },
    // (async)
    async ensureModuleLoaded (moduleId, visited = new Set()) {
      visited.add(moduleId)
      const moduleEntry = await _getModuleWhenReady(moduleId)
      const { depMap } = moduleEntry
      await Promise.all(
        Object.values(depMap)
          .filter(Boolean)
          .filter((entry) => !visited.has(entry))
          .map((entry) => gatorRuntime.ensureModuleLoaded(entry, visited)),
      )
    },
    // assumes all modules loaded
    runModule (moduleId) {
      if (moduleCache.has(moduleId)) {
        return moduleCache.get(moduleId).exports
      }
      if (!moduleRegistry.has(moduleId)) {
        throw new Error(`gator-runtime: module must be registered "${moduleId}"`)
      }
      const moduleEntry = moduleRegistry.get(moduleId)
      const { depMap, moduleInitializer } = moduleEntry
      const moduleObj = { exports: {} }
      moduleCache.set(moduleId, moduleObj)
      const localRequire = (requestedName) => {
        const resolvedName = depMap[requestedName] || requestedName
        return gatorRuntime.runModule(resolvedName)
      }
      moduleInitializer.call(moduleObj.exports, localRequire, moduleObj.exports, moduleObj)
      return moduleObj.exports
    },
    // primarily for debugging
    getPendingModules () {
      return (
        Array.from(moduleRegistryQueue.keys())
          .filter((entry) => !moduleRegistry.has(entry))
      )
    },
  })
  globalThis.gatorRuntime = gatorRuntime

  function _loadModule (moduleId) {
    const scriptTag = document.createElement('script')
    scriptTag.src = `./${moduleId}`
    scriptTag.charset = 'utf-8'
    scriptTag.async = true
    scriptTag.setAttribute('data-gatorid', moduleId)
    document.head.appendChild(scriptTag)
  }

  function _getModuleWhenReady (moduleId) {
    if (moduleRegistry.has(moduleId)) {
      return moduleRegistry.get(moduleId)
    }
    if (moduleRegistryQueue.has(moduleId)) {
      const { promise } = moduleRegistryQueue.get(moduleId)
      return promise
    }
    throw new Error(`gator-runtime: module not loaded or queued "${moduleId}"`)
  }

  function deferred () {
    let resolve
    let reject
    const promise = new Promise((_resolve, _reject) => {
      resolve = _resolve
      reject = _reject
    })
    return { resolve, reject, promise }
  }

})()
