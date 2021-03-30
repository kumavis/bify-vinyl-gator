;(async function start () {
  const entryFiles = {{entryFiles}}

  entryFiles.forEach(entry => {
    gatorRuntime.requestModule(entry)
  })
  
  await Promise.all(entryFiles.map(async entry => {
    return gatorRuntime.ensureModuleLoaded(entry)
  }))

  entryFiles.forEach(entry => {
    gatorRuntime.runModule(entry)
  })
})()