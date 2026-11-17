// Amiibo layout and signing derived from amiitool (MIT), see THIRD_PARTY.md.
import { normalizeDump, readUid, rerollUid } from './ntag215Utils'

const LAYOUT = [
  [0x000, 0x008, 0x008],
  [0x008, 0x080, 0x020],
  [0x028, 0x010, 0x024],
  [0x04c, 0x0a0, 0x168],
  [0x1b4, 0x034, 0x020],
  [0x1d4, 0x000, 0x008],
  [0x1dc, 0x054, 0x02c],
] as const

const INTERNAL_SIZE = 0x208
const DATA_HMAC = 0x008
const TAG_HMAC = 0x1b4
const KEY_SIZE = 80

async function hmacKey(raw: Uint8Array<ArrayBuffer>) {
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

async function sign(key: CryptoKey, data: Uint8Array<ArrayBuffer>) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data))
}

async function derive(master: Uint8Array<ArrayBuffer>, plain: Uint8Array<ArrayBuffer>) {
  const type = master.subarray(16, 30)
  const end = type.indexOf(0)
  const typeSize = end < 0 ? type.length : end + 1
  const magicSize = master[31]
  const seed = new Uint8Array(2 + typeSize + 64)
  seed.set(type.subarray(0, typeSize), 2)

  const offset = 2 + typeSize
  const counter = new Uint8Array(16)
  counter.set(plain.subarray(0x029, 0x02b))
  seed.set(counter.subarray(0, 16 - magicSize), offset)
  seed.set(master.subarray(32, 32 + magicSize), offset + 16 - magicSize)
  seed.set(plain.subarray(0x1d4, 0x1dc), offset + 16)
  seed.set(plain.subarray(0x1d4, 0x1dc), offset + 24)
  for (let i = 0; i < 32; i++) seed[offset + 32 + i] = plain[0x1e8 + i] ^ master[48 + i]

  const key = await hmacKey(master.slice(0, 16))
  const material = await sign(key, seed)
  seed[1] = 1
  const mac = await sign(key, seed)
  return { aes: material.slice(0, 16), iv: material.slice(16, 32), mac: mac.slice(0, 16) }
}

async function cipher(bytes: Uint8Array<ArrayBuffer>, keys: Awaited<ReturnType<typeof derive>>) {
  const key = await crypto.subtle.importKey('raw', keys.aes, 'AES-CTR', false, ['encrypt'])
  const area = await crypto.subtle.encrypt(
    { name: 'AES-CTR', counter: keys.iv, length: 128 }, key, bytes.subarray(0x02c, 0x1b4),
  )
  bytes.set(new Uint8Array(area), 0x02c)
}

async function updateSignatures(plain: Uint8Array<ArrayBuffer>, dataMac: Uint8Array<ArrayBuffer>, tagMac: Uint8Array<ArrayBuffer>) {
  plain.set(await sign(await hmacKey(tagMac), plain.subarray(0x1d4)), TAG_HMAC)
  plain.set(await sign(await hmacKey(dataMac), plain.subarray(0x029)), DATA_HMAC)
}

export async function rerollSignedAmiibo(dump: Uint8Array, suppliedKeys: Uint8Array) {
  if (suppliedKeys.length !== KEY_SIZE * 2 || suppliedKeys[31] > 16 || suppliedKeys[111] > 16) {
    throw new Error('Selecciona key_retail.bin con las dos claves (160 bytes).')
  }

  const original = normalizeDump(dump)
  const plain = new Uint8Array(INTERNAL_SIZE)
  for (const [offset, source, length] of LAYOUT) plain.set(original.subarray(source, source + length), offset)
  const originalSigs = [plain.slice(DATA_HMAC, DATA_HMAC + 32), plain.slice(TAG_HMAC, TAG_HMAC + 32)]
  const dataMaster = suppliedKeys.slice(0, KEY_SIZE)
  const tagMaster = suppliedKeys.slice(KEY_SIZE)
  try {
    const currentData = await derive(dataMaster, plain)
    const currentTag = await derive(tagMaster, plain)
    await cipher(plain, currentData)
    await updateSignatures(plain, currentData.mac, currentTag.mac)
    if (!originalSigs.every((part, index) => {
      const offset = index === 0 ? DATA_HMAC : TAG_HMAC
      return part.every((byte, position) => byte === plain[offset + position])
    })) {
      throw new Error('Las firmas del archivo no coinciden con las claves proporcionadas.')
    }

    const result = rerollUid(original)
    plain.set(result.subarray(0, 8), 0x1d4)
    plain[0] = result[8]
    const newData = await derive(dataMaster, plain)
    const newTag = await derive(tagMaster, plain)
    await updateSignatures(plain, newData.mac, newTag.mac)
    await cipher(plain, newData)
    for (const [offset, destination, length] of LAYOUT) result.set(plain.subarray(offset, offset + length), destination)

    const uid = readUid(result)
    result.set(Uint8Array.of(0xaa ^ uid[1] ^ uid[3], 0x55 ^ uid[2] ^ uid[4],
      0xaa ^ uid[3] ^ uid[5], 0x55 ^ uid[4] ^ uid[6]), 0x214)
    result.set(Uint8Array.of(0x80, 0x80), 0x218)
    return result
  } finally {
    dataMaster.fill(0)
    tagMaster.fill(0)
  }
}
