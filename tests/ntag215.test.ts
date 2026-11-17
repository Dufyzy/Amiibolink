import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { rerollSignedAmiibo } from '../src/services/amiiboCrypto'
import { getAmiiboId, normalizeDump, readUid, rerollUid, toHex } from '../src/services/ntag215Utils'

test('normalizes standard dumps, preserves the Amiibo ID and rejects unsupported sizes', () => {
  for (const size of [532, 540, 572]) {
    const input = new Uint8Array(size).fill(0xa5)
    input.set([0x01, 0, 0, 0, 0x04, 0x18, 0x09, 0x02], 0x54)
    const output = normalizeDump(input)
    assert.equal(output.length, 540)
    assert.equal(getAmiiboId(output), '0100000004180902')
    assert.deepEqual(output.slice(0, Math.min(size, 540)), input.slice(0, 540))
    if (size === 532) assert.deepEqual(output.slice(532), new Uint8Array(8))
  }
  assert.throws(() => normalizeDump(new Uint8Array(520)), /Tamaño inválido/)
})

test('generates NXP UID fields with BCC0 and BCC1 without mutating the source', () => {
  const input = new Uint8Array(540)
  const updated = rerollUid(input)
  assert.equal(updated[0], 4)
  assert.equal(updated[3], 0x88 ^ updated[0] ^ updated[1] ^ updated[2])
  assert.equal(updated[8], updated[4] ^ updated[5] ^ updated[6] ^ updated[7])
  assert.deepEqual(input, new Uint8Array(540))
})

test('re-signs a synthetic reference dump and rejects invalid signatures', async ({ mock }) => {
  // Independently generated with PyAmiibo 0.2.0 and synthetic keys.
  const fixture = [
    'BCAxnUJTZHUAYIWqz/QZPmOIrdIJTQwqgs2o/FOg5wWBgnnfmjmMUIzp9tumg6OURNS+E5Z0jDxJAMWrRc+M5kTnrInkstzBtc5ALOc9aqCa0obeN1yBpsvw',
    'FTpfhKnO8xg9Yoes0fYbQGWKr9T5HkNojbLX/CFGa5C12v8kSW4x9iOIWjkVYsrE+EPmlY/R+S151U05icDyUeYnZMm91Vlx0kEci8gafqA+cx9CxECT75jd',
    'RioNGU2Yxk65hshirFCAkol7NN/PJRH60ZhmxRvykKQquZb7AQEsasja4hWTa10BUB7/UCIJFsgs6ziw+VsIpTE6xuW/YS6tzmljKYaZRffWuvaJ4ihL0AEC',
    '4PTyvZLLJyMt60UHgbiBWerDQ/Uu6S/vuyKMhtSOy+nNhJc2HFUseSp2Ko//1EHVm0y4zNcE8BjtmbAPYsJhsZjaOsuNAQHBN/gpPvNpZ4PePrFwCEr8xpzh',
    'CGPOZzDIqi/apz4bY7+Ki2ywJqAfpTVKYu++ZJeoM8r80jY+8ZjoyAYY+Y41cOWdYh3vwMi/1SUVupdVvP4DTfA79fKa90BC3bs77srRscB/YEUQnsM97pYG',
    'JdKlU1yXZR6EuA+0R+dyhGuesksyLM84+IS8yV4yahV3ozChmxcxNs3KsEFSdkWOfQ9zbLxfCLO58EyHJZh4tLEz4+doojtgharP9Bk+Y4it0sg3jHOAgNX6',
  ].join('')
  const original = new Uint8Array(Buffer.from(fixture, 'base64'))
  const keys = Uint8Array.from({ length: 160 }, (_, index) => (index * 29 + 7) % 256)
  keys.set(new TextEncoder().encode('data test key\0'), 16)
  keys.set(new TextEncoder().encode('tag  test key\0'), 96)
  keys[31] = 14
  keys[111] = 16
  mock.method(crypto, 'getRandomValues', () => Uint8Array.of(4, 2, 3, 4, 5, 6, 7))

  const result = await rerollSignedAmiibo(original, keys)
  assert.equal(toHex(readUid(result)), '04020304050607')
  assert.equal(getAmiiboId(result), getAmiiboId(original))
  assert.equal(createHash('sha256').update(result).digest('hex'), 'b2c9a1a26c71b4c7b806d4cd7704dfb8b5ee3a950ed5f3730c9ae88a4a74ddaa')

  original[0x80] ^= 1
  await assert.rejects(rerollSignedAmiibo(original, keys), /firmas/)
})
