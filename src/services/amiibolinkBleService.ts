import { buildTransfer, matchesAck, MODE_FRAMES, NUS, type DeviceMode, type TransferStage } from './amiibolinkProtocol'
import { toHex } from './ntag215Utils'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected'
export type LogEntry = { time: number; direction: 'TX' | 'RX' | 'BLE'; text: string }
export type TransferProgress = { stage: TransferStage; percent: number }

type PendingAck = {
  expected: readonly number[]
  resolve: () => void
  reject: (error: Error) => void
}

const ACK_TIMEOUT = 4500

export class AmiibolinkBleService {
  private device?: BluetoothDevice
  private writer?: BluetoothRemoteGATTCharacteristic
  private notifier?: BluetoothRemoteGATTCharacteristic
  private pending?: PendingAck
  private busy = false
  private state: ConnectionState = 'disconnected'

  constructor(private readonly callbacks: {
    state: (state: ConnectionState, name?: string) => void
    log: (entry: LogEntry) => void
  }) {}

  private log(direction: LogEntry['direction'], text: string) {
    this.callbacks.log({ time: Date.now(), direction, text })
  }

  private changeState(state: ConnectionState) {
    this.state = state
    this.callbacks.state(state, this.device?.name)
  }

  async connect() {
    if (this.state !== 'disconnected' || this.busy) return
    if (!window.isSecureContext) throw new Error('Abre la app por HTTPS o en localhost para usar Bluetooth.')
    if (!navigator.bluetooth) throw new Error('Este navegador no ofrece Web Bluetooth. Usa Chrome, Edge o Bluefy en iOS.')
    this.changeState('connecting')
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'amiibolink' }, { services: [NUS.service] }],
        optionalServices: [NUS.service],
      })
      if (!device.gatt) throw new Error('El dispositivo seleccionado no ofrece un servidor GATT.')
      this.device = device
      device.addEventListener('gattserverdisconnected', this.onDisconnect)
      const server = await device.gatt.connect()
      const service = await server.getPrimaryService(NUS.service)
      this.writer = await service.getCharacteristic(NUS.write)
      this.notifier = await service.getCharacteristic(NUS.notify)
      this.notifier.addEventListener('characteristicvaluechanged', this.onNotification)
      await this.notifier.startNotifications()
      if (this.device !== device || !server.connected) throw new Error('Se perdió la conexión con el dispositivo.')
      this.changeState('connected')
      this.log('BLE', `${device.name || 'Amiibolink'} conectado · notificaciones activas`)
    } catch (error) {
      this.disconnect()
      const reason = error instanceof Error && error.name === 'NotFoundError'
        ? new Error('No se seleccionó ningún Amiibolink. Activa el dispositivo e inténtalo de nuevo.')
        : error
      this.log('BLE', String(reason))
      throw reason
    }
  }

  disconnect() {
    const gatt = this.device?.gatt
    this.onDisconnect()
    if (gatt?.connected) gatt.disconnect()
  }

  private onDisconnect = () => {
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnect)
    this.notifier?.removeEventListener('characteristicvaluechanged', this.onNotification)
    this.pending?.reject(new Error('Se perdió la conexión Bluetooth.'))
    this.device = undefined
    this.writer = undefined
    this.notifier = undefined
    if (this.state !== 'disconnected') {
      this.changeState('disconnected')
      this.log('BLE', 'Dispositivo desconectado')
    }
  }

  private onNotification = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (!value) return
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice()
    this.log('RX', toHex(bytes, ' ').toUpperCase())
    const pending = this.pending
    if (!pending) return
    void matchesAck(bytes, pending.expected).then((matches) => {
      if (matches && this.pending === pending) pending.resolve()
    }).catch(() => this.log('BLE', 'No se pudo verificar el formato del ACK.'))
  }

  private write(writer: BluetoothRemoteGATTCharacteristic, frame: Uint8Array<ArrayBuffer>) {
    if (writer.properties.write && typeof writer.writeValueWithResponse === 'function') {
      return writer.writeValueWithResponse(frame)
    }
    if (writer.properties.writeWithoutResponse && typeof writer.writeValueWithoutResponse === 'function') {
      return writer.writeValueWithoutResponse(frame)
    }
    return writer.writeValue(frame)
  }

  private async exchange(frame: Uint8Array<ArrayBuffer>, expected: readonly number[]) {
    const writer = this.writer
    if (!writer) throw new Error('Conecta el Amiibolink para continuar.')

    let timer: ReturnType<typeof setTimeout> | undefined
    const failure = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(
        `Tiempo de espera agotado para el ACK ${toHex(Uint8Array.from(expected), ' ').toUpperCase()}.`,
      )), ACK_TIMEOUT)
    })
    const ack = new Promise<void>((resolve, reject) => {
      this.pending = { expected, resolve, reject }
    })
    this.log('TX', toHex(frame, ' ').toUpperCase())
    try {
      const write = Promise.resolve().then(() => this.write(writer, frame))
      await Promise.race([Promise.all([ack, write]), failure])
    } finally {
      clearTimeout(timer)
      this.pending = undefined
    }
  }

  private async run(operation: () => Promise<void>) {
    if (this.busy) throw new Error('Ya hay una operación Bluetooth en curso.')
    if (this.state !== 'connected') throw new Error('Conecta el Amiibolink para continuar.')
    this.busy = true
    try {
      await operation()
    } catch (error) {
      this.log('BLE', String(error))
      this.disconnect()
      throw error
    } finally {
      this.busy = false
    }
  }

  async setMode(mode: DeviceMode) {
    await this.run(() => this.exchange(MODE_FRAMES[mode], [0xb1, 0xa1]))
  }

  async upload(input: Uint8Array, onProgress: (progress: TransferProgress) => void) {
    const steps = buildTransfer(input)
    await this.run(async () => {
      onProgress({ stage: 'preparing', percent: 0 })
      for (const [index, step] of steps.entries()) {
        await this.exchange(step.frame, step.ack)
        onProgress({ stage: step.stage, percent: Math.round((index + 1) * 100 / steps.length) })
      }
      this.log('BLE', 'Transferencia confirmada por el dispositivo')
    })
  }
}
