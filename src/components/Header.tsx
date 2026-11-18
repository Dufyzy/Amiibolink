import { useRef } from 'react'
import { Bluetooth, Download, Fingerprint, LockKeyhole, Radio, Shuffle, WifiOff } from 'lucide-react'
import type { useDevice } from '../hooks/useDevice'

type HeaderProps = {
  device: ReturnType<typeof useDevice>
  offlineReady: boolean
  installed: boolean
  onInstall: () => Promise<boolean>
}

export function Header({ device, offlineReady, installed, onInstall }: HeaderProps) {
  const installHelp = useRef<HTMLDialogElement>(null)
  const connected = device.connection === 'connected'
  const connecting = device.connection === 'connecting'

  async function handleInstall() {
    if (!await onInstall()) installHelp.current?.showModal()
  }

  return (
    <header>
      <div className="topbar">
        <div className="frame topbar-inner">
          <a className="wordmark" href={import.meta.env.BASE_URL} aria-label="Inicio de Amiibolink Studio">
            <span className="brand-icon"><Radio size={20} aria-hidden="true" /></span>
            <span>Amiibolink <span className="wordmark-light">Studio</span></span>
          </a>
          <div className="top-actions">
            {!installed && <button className="icon-button install-button" type="button" onClick={() => void handleInstall()}
              aria-label="Instalar app" title="Instalar app"><Download size={18} aria-hidden="true" /></button>}
            <span role="status" className={`connection ${connected ? 'connection-active' : ''}`}>
              <span className="indicator" aria-hidden="true" />
              {connected ? (device.deviceName || 'Conectado') : connecting ? 'Buscando…' : 'Sin conectar'}
            </span>
            <button className={`button ${connected ? 'button-outline' : 'button-primary'} connect-button`}
              type="button" disabled={connecting || device.busy} onClick={() => void device.toggleConnection()}>
              <Bluetooth size={18} aria-hidden="true" />
              <span>{connected ? 'Desconectar' : connecting ? 'Conectando…' : 'Conectar Amiibolink'}</span>
            </button>
          </div>
        </div>
      </div>

      {!installed && <dialog ref={installHelp} className="file-dialog" aria-labelledby="install-title">
        <h2 id="install-title">Instalar app</h2>
        <p>En <strong>Chrome o Edge para computadora</strong>, busca «Instalar» en la barra de direcciones o en el menú del navegador.</p>
        <p>En <strong>Chrome para Android</strong>, abre el menú y elige «Añadir a pantalla de inicio».</p>
        <p>En <strong>Safari para iPhone o iPad</strong>, toca «Compartir» y elige «Añadir a pantalla de inicio».
          Activa «Abrir como app web» si aparece. Para usar Bluetooth, abre la app en Bluefy.</p>
        <form method="dialog" className="dialog-actions">
          <button className="button button-primary" type="submit" autoFocus>Entendido</button>
        </form>
      </dialog>}

      <div className="frame">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <h1 id="page-title">Biblioteca<br />Amiibo<span>.</span></h1>
            <p>Importa tus archivos y cárgalos por Bluetooth en tu Amiibolink Clásico.</p>
            <span className="offline-label"><WifiOff size={16} aria-hidden="true" />
              {offlineReady ? 'Lista para usar sin conexión' : 'Biblioteca local'}
            </span>
          </div>
          <div className="hero-signal" aria-hidden="true">
            <img className="hero-link" src={`${import.meta.env.BASE_URL}showcase/link.webp`} alt="" fetchPriority="high" />
          </div>
        </section>

        <div className="device-strip">
          <div className="device-label" id="mode-label">Modo del emulador</div>
          <div className="segmented" role="group" aria-labelledby="mode-label" aria-describedby="mode-help">
            <button type="button" aria-pressed={device.mode === 'fixed'} disabled={!connected || device.busy}
              onClick={() => void device.changeMode('fixed')} title="Modo lectura y escritura en firmware compatible">
              <LockKeyhole size={16} aria-hidden="true" /> Fijo
            </button>
            <button type="button" aria-pressed={device.mode === 'manual'} disabled={!connected || device.busy}
              onClick={() => void device.changeMode('manual')}><Fingerprint size={16} aria-hidden="true" /> Manual</button>
            <button type="button" aria-pressed={device.mode === 'automatic'} disabled={!connected || device.busy}
              onClick={() => void device.changeMode('automatic')}><Shuffle size={16} aria-hidden="true" /> Auto-Random</button>
          </div>
          <p id="mode-help">{connected
            ? 'Fijo conserva el UID en firmware compatible. Manual lo cambia con el botón y Auto-Random al escanear.'
            : 'Conecta el Amiibolink para elegir el modo.'}</p>
        </div>
      </div>
    </header>
  )
}
