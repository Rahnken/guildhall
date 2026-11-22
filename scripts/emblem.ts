// Builds the site's logo from the guild's tabard.
//
//   (in game)              /gh status, then /reload
//   (wow.export)           Textures tab: search "guildemblems/emblem_<number>",
//                          select all, Export as PNG. This script says which
//                          search if the pictures are missing.
//   npm run emblem:build   writes public/emblem.webp (the round logo),
//                          public/tabard.webp (the banner on the home page)
//                          and src/data/emblem.json
//
// The game keeps each emblem as one white picture of its right half, which
// it mirrors and colours. This does the same: mirrors the half, colours it
// as the tabard's own emblem texture is coloured, and sets it on a round
// badge in the tabard's background and border colours.
// Reads WOW_FOREVER_DIR, WOW_ACCOUNT and WOW_EXPORT_DIR from .env.local.
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'

import { parseSavedVariables } from '../src/lib/wow/luaTable'

const root = join(import.meta.dirname, '..')
const wowDir =
  process.env.WOW_FOREVER_DIR?.trim() ||
  'C:/Program Files (x86)/World of Warcraft/_forever_'
const exported =
  process.env.WOW_EXPORT_DIR?.trim() || join(homedir(), 'wow.export')

/** Pixels on a side: several times the size the header draws it. */
const SIZE = 128

type Loose = Record<string, unknown>
const record = (v: unknown): Loose =>
  typeof v === 'object' && v !== null ? (v as Loose) : {}

/** The tabard the addon saved most recently: its colours and emblem files. */
function savedTabard() {
  const accounts = join(wowDir, 'WTF', 'Account')
  const wanted = process.env.WOW_ACCOUNT?.trim()
  const file = (existsSync(accounts) ? readdirSync(accounts) : [])
    .filter((account) => !wanted || account === wanted)
    .map((account) =>
      join(accounts, account, 'SavedVariables', 'Guildhall.lua'),
    )
    .filter((path) => existsSync(path))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  if (!file) throw new Error(`No Guildhall.lua under ${accounts}.`)
  const db = record(parseSavedVariables(readFileSync(file, 'utf8')).GuildhallDB)
  for (const guild of Object.values(record(db.guilds))) {
    const tabard = record(record(guild).tabard)
    const files = Object.values(record(tabard.files)).map(Number)
    const half = Number(tabard.emblemFile ?? record(tabard.info).emblemFileID)
    if (files.length >= 4 && half && typeof tabard.background === 'string')
      return {
        background: tabard.background,
        border: String(tabard.border),
        /** The white picture of the emblem's right half. */
        half,
        /** The emblem as coloured on the tabard's upper chest. */
        coloured: files[2],
      }
  }
  throw new Error(
    `No tabard in ${file}. In game: /gh status, then /reload, then run this again.`,
  )
}

/** The exported picture for a game file id, from wow.export's file list. */
function exportedPicture(id: number): string {
  const list = join(
    process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
    'wow.export/User Data/Default/casc/listfile/listfile-pf-textures.dat',
  )
  if (!existsSync(list))
    throw new Error(
      `No wow.export file list at ${list}. Open the game in it once.`,
    )
  const data = readFileSync(list)
  let pos = 4
  while (pos + 4 < data.length) {
    const end = data.indexOf(0, pos + 4)
    if (end < 0) break
    if (data.readUInt32BE(pos) === id) {
      const name = data.toString('latin1', pos + 4, end)
      const picture = join(exported, name.replace(/\.blp$/i, '.png'))
      if (!existsSync(picture))
        throw new Error(
          `${picture} is not exported. In wow.export, search "${name.replace(/(_\d+_t[ul]_u)?\.blp$/i, '')}", select all and Export as PNG.`,
        )
      return picture
    }
    pos = end + 1
  }
  throw new Error(`The game's file list has no file ${id}.`)
}

const pixels = (file: string) =>
  sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

async function build() {
  const tabard = savedTabard()

  // The colour the game paints this emblem: the average of the solid parts
  // of its coloured texture.
  const coloured = await pixels(exportedPicture(tabard.coloured))
  const sum = [0, 0, 0]
  let solid = 0
  for (let i = 0; i < coloured.data.length; i += 4)
    if (coloured.data[i + 3] > 200) {
      for (let c = 0; c < 3; c++) sum[c] += coloured.data[i + c]
      solid++
    }
  if (solid === 0) throw new Error('The coloured emblem picture is empty.')
  const colour = sum.map((total) => Math.round(total / solid))

  // The half picture: keep its shape, swap white for that colour, and trim
  // to the part that holds anything. Its left edge is the emblem's middle.
  const half = await pixels(exportedPicture(tabard.half))
  const { width, height } = half.info
  let right = 0
  let top = height
  let bottom = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c++) half.data[i + c] = colour[c]
      if (half.data[i + 3] > 24) {
        right = Math.max(right, x + 1)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y + 1)
      }
    }
  if (right === 0) throw new Error('The emblem picture is empty.')
  const rightHalf = await sharp(half.data, {
    raw: { width, height, channels: 4 },
  })
    .extract({ left: 0, top, width: right, height: bottom - top })
    .png()
    .toBuffer()
  const emblem = await sharp({
    create: {
      width: right * 2,
      height: bottom - top,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: await sharp(rightHalf).flop().toBuffer(), top: 0, left: 0 },
      { input: rightHalf, top: 0, left: right },
    ])
    .png()
    .toBuffer()

  // A round badge: the tabard's background with its border colour around it.
  const inner = Math.round(SIZE * 0.6)
  const fitted = await sharp(emblem)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer()
  const ring = Math.round(SIZE * 0.07)
  const badge = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
      `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2 - ring / 2}" fill="${tabard.background}" stroke="${tabard.border}" stroke-width="${ring}"/></svg>`,
  )
  const offset = Math.round((SIZE - inner) / 2)
  await sharp(badge)
    .composite([{ input: fitted, top: offset, left: offset }])
    .webp({ quality: 92 })
    .toFile(join(root, 'public', 'emblem.webp'))
  // And a banner, the shape the game shows a guild's tabard in: square at
  // the top, coming to a point below, with the emblem in the upper part.
  const W = 180
  const H = 220
  const edge = 12
  const banner = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      `<path d="M${edge / 2},${edge / 2} H${W - edge / 2} V${H * 0.7} L${W / 2},${H - edge / 2} L${edge / 2},${H * 0.7} Z" ` +
      `fill="${tabard.background}" stroke="${tabard.border}" stroke-width="${edge}" stroke-linejoin="round"/></svg>`,
  )
  const onBanner = Math.round(W * 0.58)
  await sharp(banner)
    .composite([
      {
        input: await sharp(emblem)
          .resize(onBanner, onBanner, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .toBuffer(),
        top: Math.round(H * 0.16),
        left: Math.round((W - onBanner) / 2),
      },
    ])
    .webp({ quality: 92 })
    .toFile(join(root, 'public', 'tabard.webp'))

  writeFileSync(
    join(root, 'src', 'data', 'emblem.json'),
    JSON.stringify({ file: '/emblem.webp', tabard: '/tabard.webp' }) + '\n',
  )
  console.log(
    `Wrote public/emblem.webp and public/tabard.webp: emblem rgb(${colour.join(', ')}) on ${tabard.background}, ringed ${tabard.border}.`,
  )
}

build().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
