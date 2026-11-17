export const NTAG215_SIZE = 540
export const DUMP_SIZES = [532, NTAG215_SIZE, 572] as const

export function toHex(bytes: Uint8Array, separator = '') {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(separator)
}

export function normalizeDump(input: Uint8Array) {
  const supportedSizes: readonly number[] = DUMP_SIZES
  if (!supportedSizes.includes(input.length)) {
    throw new Error(`Tamaño inválido (${input.length} bytes). Se esperan 532, 540 o 572 bytes.`)
  }
  const normalized = new Uint8Array(NTAG215_SIZE)
  normalized.set(input.subarray(0, NTAG215_SIZE))
  return normalized
}

export function getAmiiboId(dump: Uint8Array) {
  if (dump.length < 0x5c) throw new Error('El archivo no contiene un ID de Amiibo.')
  return toHex(dump.subarray(0x54, 0x5c))
}

export function readUid(dump: Uint8Array) {
  return Uint8Array.of(...dump.subarray(0, 3), ...dump.subarray(4, 8))
}

/** Applies the NTAG215 UID and BCC fields. Amiibo signing is performed separately. */
export function rerollUid(dump: Uint8Array) {
  const copy = normalizeDump(dump)
  const uid = crypto.getRandomValues(new Uint8Array(7))
  uid[0] = 0x04
  copy.set(uid.subarray(0, 3), 0)
  copy.set(uid.subarray(3), 4)
  copy[3] = 0x88 ^ uid[0] ^ uid[1] ^ uid[2]
  copy[8] = uid[3] ^ uid[4] ^ uid[5] ^ uid[6]
  return copy
}
