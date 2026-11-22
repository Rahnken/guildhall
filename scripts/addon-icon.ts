// Makes the addon's icon, shown beside it in the game's addon list, from the
// site's logo (public/logo.svg).
//
//   npm run addon:icon   writes addon/MankriksFluffers/icon.tga
//
// The game reads TGA and BLP pictures, not PNG or SVG, and wants sides that
// are a power of two. This writes the simplest kind of TGA: 32-bit colour,
// not compressed, 64 pixels square.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import sharp from 'sharp'

import { ADDON_FOLDER } from '../src/lib/wow/addon'

const root = join(import.meta.dirname, '..')
const SIZE = 64

const { data } = await sharp(join(root, 'public', 'logo.svg'), { density: 300 })
  .resize(SIZE, SIZE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const header = Buffer.alloc(18)
header[2] = 2 // true colour, not compressed
header.writeUInt16LE(SIZE, 12)
header.writeUInt16LE(SIZE, 14)
header[16] = 32 // bits per pixel
header[17] = 0x28 // 8 bits of transparency; rows run from the top down

// TGA stores blue, green, red, alpha; sharp gives red, green, blue, alpha.
const pixels = Buffer.alloc(data.length)
for (let i = 0; i < data.length; i += 4) {
  pixels[i] = data[i + 2]
  pixels[i + 1] = data[i + 1]
  pixels[i + 2] = data[i]
  pixels[i + 3] = data[i + 3]
}

const file = join(root, 'addon', ADDON_FOLDER, 'icon.tga')
writeFileSync(file, Buffer.concat([header, pixels]))
console.log(`Wrote ${file} (${SIZE}×${SIZE}).`)
