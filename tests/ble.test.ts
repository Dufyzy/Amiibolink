import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv } from 'node:crypto'
import { test } from 'node:test'
import { AmiibolinkBleService, type ConnectionState, type LogEntry } from '../src/services/amiibolinkBleService'
import { buildTransfer, matchesAck, MODE_FRAMES, NUS } from '../src/services/amiibolinkProtocol'
import { toHex } from '../src/services/ntag215Utils'

test('frames 540 bytes as 27 indexed payloads between documented control frames', () => {
  const input = Uint8Array.from({ length: 540 }, (_, index) => index % 251)
  const steps = buildTransfer(input)
  assert.equal(steps.length, 32)
  assert.deepEqual(steps.slice(0, 3).map(({ frame }) => toHex(frame)), ['a0b0', 'acac00040000021c', 'abab021c'])
  assert.deepEqual(steps.slice(-2).map(({ frame }) => toHex(frame)), ['bcbc', 'ccdd'])
  for (const [index, { frame, ack }] of steps.slice(3, 30).entries()) {
    assert.equal(frame.length, 26)
    assert.equal(toHex(frame.slice(0, 4)), 'ddaa0014')
    assert.deepEqual(frame.slice(4, 24), input.slice(index * 20, (index + 1) * 20))
    assert.deepEqual([...frame.slice(-2)], [0, index + 1])
    assert.deepEqual(ack, [0xaa, 0xdd])
  }
})

test('accepts plaintext and encrypted V2 ACKs and rejects unrelated notifications', async () => {
  const raw = [0xb1, 0xa1]
  const key = Buffer.from('4b47465f414d494c07e704060a2a13f5', 'hex')
  const cipher = createCipheriv('aes-128-ecb', key, null)
  const encrypted = cipher.update(Buffer.from(raw))
  const notification = Uint8Array.of(0x13, 0xf5, 16, 2, ...encrypted, ...cipher.final())
  assert.equal(await matchesAck(Uint8Array.from(raw), raw), true)
  assert.equal(await matchesAck(notification, raw), true)
  assert.equal(await matchesAck(notification, [0xaa, 0xdd]), false)
})

test('uses the Classic V2 read/write, manual and automatic mode codes', () => {
  const key = Buffer.from('4b47465f414d494c07e704060a2a0000', 'hex')
  for (const [frame, code] of [[MODE_FRAMES.fixed, 3], [MODE_FRAMES.manual, 1], [MODE_FRAMES.automatic, 4]] as const) {
    const decipher = createDecipheriv('aes-128-ecb', key, null)
    const payload = Buffer.concat([decipher.update(frame.subarray(4)), decipher.final()])
    assert.deepEqual([...payload], [0xa1, 0xb1, code])
  }
})

test('subscribes before writing, checks ACKs, and disconnects safely on an interrupted write', async () => {
  const input = new Uint8Array(532)
  const states: ConnectionState[] = []
  const frames: string[] = []
  const log: LogEntry[] = []
  const notifier = new EventTarget() as EventTarget & { value?: DataView; startNotifications: () => Promise<void> }
  let subscribed = false
  let willDisconnect = false
  notifier.startNotifications = async () => { subscribed = true }
  function receive(bytes: number[]) {
    notifier.value = new DataView(Uint8Array.from(bytes).buffer)
    notifier.dispatchEvent(new Event('characteristicvaluechanged'))
  }
  const device = new EventTarget()
  const gatt = {
    connected: false,
    async connect() { this.connected = true; return this },
    disconnect() {
      this.connected = false
      device.dispatchEvent(new Event('gattserverdisconnected'))
    },
    async getPrimaryService(uuid: string) {
      assert.equal(uuid, NUS.service)
      return { getCharacteristic: async (id: string) => id === NUS.write ? writer : notifier }
    },
  }
  const writer = {
    properties: { write: true },
    async writeValueWithResponse(frame: Uint8Array) {
      assert.equal(subscribed, true)
      const step = buildTransfer(input)[frames.length % 32]
      frames.push(toHex(frame))
      if (willDisconnect) {
        gatt.disconnect()
      } else {
        receive([0x12, 0x34])
        await Promise.resolve()
        receive([...step.ack])
      }
    },
  }
  Object.assign(device, { name: 'amiibolink-test', gatt })
  const service = new AmiibolinkBleService({ state: (state) => states.push(state), log: (entry) => log.push(entry) })
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } })
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: {
    requestDevice: async (options: RequestDeviceOptions) => {
      assert.ok('filters' in options)
      assert.deepEqual(options.filters, [{ namePrefix: 'amiibolink' }, { services: [NUS.service] }])
      return device
    },
  } })

  try {
    await service.connect()
    const progress: number[] = []
    await service.upload(input, ({ percent }) => progress.push(percent))
    assert.equal(progress[0], 0)
    assert.equal(progress.at(-1), 100)
    assert.equal(frames.at(-1), 'ccdd')
    assert.equal(log.filter(({ direction, text }) => direction === 'RX' && text === '12 34').length, 32)

    willDisconnect = true
    await assert.rejects(service.upload(input, () => {}), /Se perdió la conexión/)
    assert.deepEqual(states, ['connecting', 'connected', 'disconnected'])
    await assert.rejects(service.upload(input, () => {}), /Conecta el Amiibolink/)
  } finally {
    service.disconnect()
    Reflect.deleteProperty(navigator, 'bluetooth')
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
