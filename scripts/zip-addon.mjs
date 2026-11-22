// Packs addon/Guildhall into public/Guildhall.zip, which the Crafting page
// links to so members can install the addon. Runs before every dev start
// and build, so the download is always the addon as it is in the repo.
//
// The zip holds one folder, Guildhall, to drop into Interface/AddOns.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'addon', 'Guildhall')

// A fixed date in every entry, so the same addon always makes the same file.
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

const locals = []
const central = []
let offset = 0
for (const file of readdirSync(source).sort()) {
  const name = Buffer.from(`Guildhall/${file}`)
  const data = readFileSync(join(source, file))
  const packed = deflateRawSync(data, { level: 9 })
  const sum = crc32(data)

  // What every entry says twice: once before its data, once in the index.
  const shared = Buffer.alloc(26)
  shared.writeUInt16LE(20, 0) // zip version needed
  shared.writeUInt16LE(0x0800, 2) // names are UTF-8
  shared.writeUInt16LE(8, 4) // deflate
  shared.writeUInt16LE(DOS_TIME, 6)
  shared.writeUInt16LE(DOS_DATE, 8)
  shared.writeUInt32LE(sum, 10)
  shared.writeUInt32LE(packed.length, 14)
  shared.writeUInt32LE(data.length, 18)
  shared.writeUInt16LE(name.length, 22)
  shared.writeUInt16LE(0, 24) // no extra field

  const local = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    shared,
    name,
    packed,
  ])
  const entry = Buffer.alloc(20)
  entry.writeUInt32LE(offset, 16) // where its local header starts
  central.push(
    Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02, 20, 0]),
      shared,
      entry.subarray(6), // comment length, disk, attributes, then the offset
      name,
    ]),
  )
  locals.push(local)
  offset += local.length
}

const index = Buffer.concat(central)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(central.length, 8)
end.writeUInt16LE(central.length, 10)
end.writeUInt32LE(index.length, 12)
end.writeUInt32LE(offset, 16)

mkdirSync(join(root, 'public'), { recursive: true })
writeFileSync(
  join(root, 'public', 'Guildhall.zip'),
  Buffer.concat([...locals, index, end]),
)
console.log(`Packed ${central.length} addon files into public/Guildhall.zip`)
