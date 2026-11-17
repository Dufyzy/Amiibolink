import { Bluetooth, Download, Fingerprint, LockKeyhole, Radio, Shuffle, WifiOff } from 'lucide-react'
import type { useDevice } from '../hooks/useDevice'

type HeaderProps = {
  device: ReturnType<typeof useDevice>
  offlineReady: boolean
  canInstall: boolean
  onInstall: () => void
}

export function Header({ device, offlineReady, canInstall, onInstall }: HeaderProps) {
  const connected = device.connection === 'connected'
  const connecting = device.connection === 'connecting'

  return (
    <header>
      <div className="topbar">
        <div className="frame topbar-inner">
          <a className="wordmark" href={import.meta.env.BASE_URL} aria-label="Inicio de Amiibolink Studio">
            <span className="brand-icon"><Radio size={20} aria-hidden="true" /></span>
            <span>Amiibolink <span className="wordmark-light">Studio</span></span>
          </a>
          <div className="top-actions">
            {canInstall && <button className="icon-button install-button" type="button" onClick={onInstall}
              aria-label="Instalar app" title="Instalar app"><Download size={18} /></button>}
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

      <div className="frame">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <h1 id="page-title">Biblioteca<br />Amiibo<span>.</span></h1>
            <p>Importa tus archivos y cárgalos por Bluetooth en tu Amiibolink Clásico.</p>
            <span className="offline-label"><WifiOff size={16} aria-hidden="true" />
              {offlineReady ? 'Lista para usar sin conexión' : 'Biblioteca local'}
            </span>
          </div>
          <div className="showcase" aria-hidden="true">
            <div className="showcase-orbit" />
            <div className="showcase-orbit orbit-outer" />
            <div className="showcase-orbit orbit-inner" />
            <img className="showcase-zelda" src={`${import.meta.env.BASE_URL}showcase/zelda.webp`} alt="" />
            <img className="showcase-ganondorf" src={`${import.meta.env.BASE_URL}showcase/ganondorf.webp`} alt="" />
            <img className="showcase-link" src={`${import.meta.env.BASE_URL}showcase/link.webp`} alt="" fetchPriority="high" />
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
