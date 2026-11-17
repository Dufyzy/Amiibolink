import { useEffect, useState } from 'react'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export function usePwa() {
  const [installEvent, setInstallEvent] = useState<InstallEvent>()
  const [offlineReady, setOfflineReady] = useState(false)

  useEffect(() => {
    let mounted = true
    const onInstallable = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallEvent)
    }
    const onInstalled = () => setInstallEvent(undefined)
    window.addEventListener('beforeinstallprompt', onInstallable)
    window.addEventListener('appinstalled', onInstalled)
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
    }
  }, [])

  async function install() {
    if (!installEvent) return
    setInstallEvent(undefined)
    await installEvent.prompt()
    await installEvent.userChoice
  }

  return { offlineReady, canInstall: Boolean(installEvent), install }
}
