import { useEffect, useRef, useState } from 'react'

type InstallEvent = Event & { prompt: () => Promise<unknown> }

const standaloneMode = '(display-mode: standalone)'

function isStandalone() {
  return window.matchMedia(standaloneMode).matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function usePwa() {
  const installEvent = useRef<InstallEvent>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [offlineReady, setOfflineReady] = useState(false)

  useEffect(() => {
    let mounted = true
    const displayMode = window.matchMedia(standaloneMode)
    const onInstallable = (event: Event) => {
      event.preventDefault()
      installEvent.current = event as InstallEvent
    }
    const onInstalled = () => {
      installEvent.current = null
      setInstalled(true)
    }
    const onDisplayModeChange = () => setInstalled(isStandalone())
    window.addEventListener('beforeinstallprompt', onInstallable)
    window.addEventListener('appinstalled', onInstalled)
    displayMode.addEventListener('change', onDisplayModeChange)
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      // Let replacements wait until current tabs close so an update cannot interrupt a BLE write.
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
        .then(() => navigator.serviceWorker.ready)
        .then(() => { if (mounted) setOfflineReady(true) })
        .catch(() => { if (mounted) setOfflineReady(false) })
    }
    return () => {
      mounted = false
      window.removeEventListener('beforeinstallprompt', onInstallable)
      window.removeEventListener('appinstalled', onInstalled)
      displayMode.removeEventListener('change', onDisplayModeChange)
    }
  }, [])

  async function install() {
    const event = installEvent.current
    if (!event) return false
    installEvent.current = null
    try {
      await event.prompt()
      return true
    } catch {
      return false
    }
  }

  return { offlineReady, installed, install }
}
