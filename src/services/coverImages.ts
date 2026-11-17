export const COVER_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'
export const MAX_COVER_BYTES = 8 * 1024 * 1024

export function isCoverFilename(name: string) {
  return /\.(jpe?g|png|webp)$/i.test(name)
}

export function coverKey(name: string) {
  return name.replace(/\\/g, '/').replace(/\.[^.\/]+$/, '').normalize('NFC').toLowerCase()
}

export async function readCover(file: Blob) {
  if (file.size > MAX_COVER_BYTES) throw new Error('La portada supera los 8 MiB.')
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const start = (signature: readonly number[], offset = 0) => signature.every((byte, index) => byte === header[index + offset])
  let type: string
  if (start([0xff, 0xd8, 0xff])) type = 'image/jpeg'
  else if (start([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) type = 'image/png'
  else if (start([0x52, 0x49, 0x46, 0x46]) && start([0x57, 0x45, 0x42, 0x50], 8)) type = 'image/webp'
  else throw new Error('La portada debe ser JPG, PNG o WebP.')

  const cover = file.slice(0, file.size, type)
  const image = new Image()
  const url = URL.createObjectURL(cover)
  try {
    image.src = url
    await image.decode()
    return cover
  } catch {
    throw new Error('La imagen está dañada o no se pudo abrir.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
