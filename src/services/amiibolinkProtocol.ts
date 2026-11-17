import { normalizeDump } from './ntag215Utils'

export const NUS = {
  service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
} as const

export type DeviceMode = 'fixed' | 'manual' | 'automatic'
export type TransferStage = 'preparing' | 'sending' | 'committing'

export interface ProtocolStep {
  stage: TransferStage
  frame: Uint8Array<ArrayBuffer>
  ack: readonly number[]
}

// Classic V2 mode frames. 03 is the read/write slot on compatible firmware.
export const MODE_FRAMES = {
  fixed: Uint8Array.of(0x00, 0x00, 0x10, 0x03, 0xe8, 0x91, 0xa7, 0xcb, 0x68, 0xc2,
    0x6d, 0x25, 0x47, 0xbd, 0x0d, 0xb7, 0xf3, 0xbf, 0xc7, 0x0e),
  manual: Uint8Array.of(0x00, 0x00, 0x10, 0x03, 0x34, 0x1f, 0x98, 0xe8, 0x46, 0x19,
    0x85, 0x75, 0xe3, 0xd3, 0xe0, 0x42, 0x5d, 0x41, 0x89, 0x42),
  automatic: Uint8Array.of(0x00, 0x00, 0x10, 0x03, 0xe3, 0x96, 0x51, 0xec, 0x07, 0xe7,
    0xe5, 0x54, 0x37, 0xb6, 0x13, 0x8e, 0x80, 0xc9, 0xb3, 0x09),
} satisfies Record<DeviceMode, Uint8Array<ArrayBuffer>>

export async function matchesAck(bytes: Uint8Array, expected: readonly number[]) {
  if (bytes.length === 2) return expected.every((byte, index) => bytes[index] === byte)
  if (bytes.length < 20 || bytes[2] !== 16 || bytes[3] !== 2) return false

  // V2 wraps the two-byte ACK in one AES-ECB block. A zero-IV CBC first block is equivalent.
  const key = await crypto.subtle.importKey('raw', Uint8Array.of(
    0x4b, 0x47, 0x46, 0x5f, 0x41, 0x4d, 0x49, 0x4c, 0x07, 0xe7, 0x04, 0x06, 0x0a, 0x2a,
    bytes[0], bytes[1],
  ), 'AES-CBC', false, ['encrypt'])
  for (const padding of [0, 14]) {
    const block = new Uint8Array(16).fill(padding)
    block.set(expected)
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv: new Uint8Array(16) }, key, block,
    ), 0, 16)
    if (encrypted.every((byte, index) => bytes[index + 4] === byte)) return true
  }
  return false
}

export function buildTransfer(input: Uint8Array): ProtocolStep[] {
  const dump = normalizeDump(input)
  const steps: ProtocolStep[] = [
    { stage: 'preparing', frame: Uint8Array.of(0xa0, 0xb0), ack: [0xb0, 0xa0] },
    { stage: 'preparing', frame: Uint8Array.of(0xac, 0xac, 0, 4, 0, 0, 2, 0x1c), ack: [0xca, 0xca] },
    { stage: 'preparing', frame: Uint8Array.of(0xab, 0xab, 2, 0x1c), ack: [0xba, 0xba] },
  ]

  for (let offset = 0; offset < dump.length; offset += 20) {
    const block = dump.subarray(offset, offset + 20)
    steps.push({
      stage: 'sending',
      frame: Uint8Array.of(0xdd, 0xaa, 0, block.length, ...block, 0, offset / 20 + 1),
      ack: [0xaa, 0xdd],
    })
  }

  steps.push(
    { stage: 'committing', frame: Uint8Array.of(0xbc, 0xbc), ack: [0xcb, 0xcb] },
    { stage: 'committing', frame: Uint8Array.of(0xcc, 0xdd), ack: [0xdd, 0xcc] },
  )

  return steps
}
