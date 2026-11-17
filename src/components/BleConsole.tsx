import { ChevronDown, Terminal } from 'lucide-react'
import type { LogEntry } from '../services/amiibolinkBleService'

export function BleConsole({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  return (
    <details className="ble-console">
      <summary><Terminal size={18} aria-hidden="true" /><span>Consola BLE</span>
        <span className="log-count">{logs.length} eventos</span><ChevronDown size={18} className="console-chevron" aria-hidden="true" />
      </summary>
      <div className="console-content">
        <div className="console-toolbar">
          <span>TX enviado / RX recibido</span>
          <button type="button" className="button button-outline" onClick={onClear} disabled={!logs.length}>Limpiar</button>
        </div>
        {logs.length ? <ol className="log-lines" aria-label="Eventos Bluetooth" tabIndex={0}>
          {logs.map(({ time, direction, text }, index) => (
            <li key={`${time}-${index}`}><time>{new Date(time).toLocaleTimeString('es')}</time>
              <b className={`log-${direction.toLowerCase()}`}>{direction}</b><span>{text}</span></li>
          ))}
        </ol> : <p className="muted">Conecta el emulador para ver la actividad Bluetooth.</p>}
      </div>
    </details>
  )
}
