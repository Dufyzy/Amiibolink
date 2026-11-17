import { useEffect, useState } from 'react'
import { AmiibolinkBleService, type ConnectionState, type LogEntry, type TransferProgress } from '../services/amiibolinkBleService'
import type { DeviceMode } from '../services/amiibolinkProtocol'

const MAX_LOGS = 400
const MODE_LABEL: Record<DeviceMode, string> = { fixed: 'Fijo', manual: 'Manual', automatic: 'Auto-Random' }

export type ActiveTransfer = { key: string } & TransferProgress

export function useDevice(report: (text: string, error?: boolean) => void) {
  const [connection, setConnection] = useState<ConnectionState>('disconnected')
  const [deviceName, setDeviceName] = useState<string>()
  const [mode, setMode] = useState<DeviceMode>()
  const [changingMode, setChangingMode] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [transfer, setTransfer] = useState<ActiveTransfer>()
  const [lastSuccess, setLastSuccess] = useState<string>()

  const [service] = useState(() => new AmiibolinkBleService({
    state: (state, name) => {
      setConnection(state)
      setDeviceName(name)
      if (state === 'disconnected') setMode(undefined)
    },
    log: (entry) => setLogs((previous) => [...previous.slice(1 - MAX_LOGS), entry]),
  }))

  useEffect(() => () => service.disconnect(), [service])

  async function toggleConnection() {
    if (connection === 'connected') {
      service.disconnect()
      return
    }
    try {
      await service.connect()
    } catch (error) {
      report(error instanceof Error ? error.message : 'No se pudo conectar al dispositivo.', true)
    }
  }

  async function changeMode(next: DeviceMode) {
    setChangingMode(true)
    try {
      await service.setMode(next)
      setMode(next)
      report(`Modo ${MODE_LABEL[next]} confirmado por el emulador.`)
    } catch (error) {
      report(error instanceof Error ? error.message : 'No se pudo cambiar el modo.', true)
    } finally {
      setChangingMode(false)
    }
  }

  async function upload(key: string, bytes: Uint8Array, name: string) {
    setLastSuccess(undefined)
    try {
      await service.upload(bytes, (progress) => setTransfer({ key, ...progress }))
      setLastSuccess(key)
      report(`${name} se cargó al emulador.`)
    } catch (error) {
      report(error instanceof Error ? error.message : 'No se pudo transferir el archivo.', true)
    } finally {
      setTransfer(undefined)
    }
  }

  return {
    connection, deviceName, logs, mode, transfer, lastSuccess, busy: changingMode || Boolean(transfer),
    toggleConnection, changeMode, upload, clearLogs: () => setLogs([]),
  }
}
