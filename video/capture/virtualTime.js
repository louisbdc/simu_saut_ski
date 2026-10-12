// Injecté dans la page avant le site : remplace l'horloge du navigateur par une horloge qu'on avance
// à la main, pour que chaque image capturée tombe exactement 1/30 s après la précédente.
(() => {
  const epoch = Date.now()
  let now = 0
  let nextId = 0
  let frameCallbacks = new Map()
  const timers = new Map()
  const frozen = new WeakSet()

  performance.now = () => now
  Date.now = () => epoch + now
  window.requestAnimationFrame = (callback) => {
    nextId += 1
    frameCallbacks.set(nextId, callback)
    return nextId
  }
  window.cancelAnimationFrame = (id) => frameCallbacks.delete(id)
  window.setTimeout = (callback, delay = 0, ...args) => {
    nextId += 1
    timers.set(nextId, { due: now + delay, run: () => callback(...args) })
    return nextId
  }
  window.clearTimeout = (id) => timers.delete(id)

  // Les animations et transitions CSS suivent l'horloge réelle : on les met en pause et on les avance nous-mêmes.
  const stepAnimations = (ms) => {
    for (const animation of document.getAnimations()) {
      if (!frozen.has(animation)) {
        frozen.add(animation)
        animation.pause()
        continue
      }
      animation.currentTime = Number(animation.currentTime ?? 0) + ms
    }
  }

  // Un pixel presque transparent change à chaque image : sans lui, une scène immobile ne redessine
  // rien et la capture d'écran attend indéfiniment une nouvelle image du navigateur.
  let ticker = null
  const tick = () => {
    if (!ticker && document.body) {
      ticker = document.createElement('div')
      ticker.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:2147483647'
      document.body.append(ticker)
    }
    if (ticker) ticker.style.background = ticker.style.background === 'black' ? 'white' : 'black'
  }

  window.__advance = (ms) => {
    now += ms
    tick()
    for (const [id, timer] of [...timers]) {
      if (timer.due > now) continue
      timers.delete(id)
      timer.run()
    }
    const callbacks = frameCallbacks
    frameCallbacks = new Map()
    for (const callback of callbacks.values()) callback(now)
    stepAnimations(ms)
  }
})()
