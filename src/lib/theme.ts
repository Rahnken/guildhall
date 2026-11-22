/**
 * The site's colour scheme, made from the three colours of the guild's
 * tabard. The pages are written with Tailwind's stone (surfaces and text),
 * amber (buttons, selection) and sky (links) colours; a theme replaces those
 * three families with shades of the tabard's background, emblem and border.
 *
 * Shades are made the way Tailwind makes its own tints: by interpolating
 * between colours with CSS color-mix. Each shade is the tabard colour mixed
 * with just enough white or black to reach the lightness the page was
 * designed with, so text stays readable, and where no mixing is needed the
 * tabard colour is used exactly as picked: on buttons, and in the band
 * across the top of the page.
 */

export type TabardColors = {
  /** "#rrggbb", or "" for the site's own colour. */
  background: string
  border: string
  emblem: string
}

const HEX = /^#[0-9a-f]{6}$/

/** A colour as "#rrggbb", or "" when it is not one. */
export const cleanColor = (value: unknown): string => {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return HEX.test(text) ? text : ''
}

/**
 * How light a colour looks, 0 (black) to 1 (white): the L of OKLab, the
 * space color-mix interpolates in below, where mixing with white or black
 * moves lightness in a straight line.
 */
function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`

/** The colour mixed with white or black until it is as light as `target`. */
function shade(color: string, own: number, target: number): string {
  // Black and near-black have no colour to keep: a plain grey instead.
  if (own < 0.03) return `color-mix(in oklab,white ${percent(target)},black)`
  if (target >= own)
    return own > 0.97
      ? color
      : `color-mix(in oklab,${color} ${percent((1 - target) / (1 - own))},white)`
  return `color-mix(in oklab,${color} ${percent(target / own)},black)`
}

/**
 * How light each stone step is once themed. Lighter than Tailwind's own
 * near-black surfaces, so the tabard colour shows as a colour: the page is
 * 900, panels 950, borders 700 and 800. The text steps (500 and up) are
 * lifted to match, to stay readable on the lighter surfaces.
 */
const SURFACES: Array<[number, number]> = [
  [50, 0.985],
  [100, 0.97],
  [200, 0.93],
  [300, 0.885],
  [400, 0.8],
  [500, 0.7],
  [600, 0.56],
  [700, 0.47],
  [800, 0.385],
  [900, 0.305],
  [950, 0.245],
]

/**
 * Accent families: step 500 is the tabard colour exactly, and the lighter
 * steps, used for text on dark panels, are at least this light.
 */
const ACCENTS: Array<{
  key: 'emblem' | 'border'
  name: string
  lighter: Array<[number, number]>
}> = [
  {
    key: 'emblem',
    name: 'amber',
    lighter: [
      [400, 0.828],
      [300, 0.879],
      [200, 0.924],
    ],
  },
  {
    key: 'border',
    name: 'sky',
    lighter: [
      [400, 0.746],
      [300, 0.828],
    ],
  },
]

/**
 * The style rule that applies a theme, or "" when no colour is set. A colour
 * left empty keeps that family as the site was designed.
 */
export function themeCss(colors: TabardColors): string {
  const rules: Array<string> = []
  const background = cleanColor(colors.background)
  if (background) {
    const own = lightness(background)
    // The band across the top of the page, in the colour as picked.
    rules.push(`--tabard-background:${background}`)
    for (const [step, target] of SURFACES)
      rules.push(`--color-stone-${step}:${shade(background, own, target)}`)
  }
  for (const { key, name, lighter } of ACCENTS) {
    const color = cleanColor(colors[key])
    if (!color) continue
    const own = lightness(color)
    rules.push(`--color-${name}-500:${color}`)
    // Text on a button of this colour: dark on a light colour, else white.
    rules.push(`--on-${name}:${own > 0.62 ? '#0c0a09' : '#ffffff'}`)
    for (const [step, target] of lighter)
      rules.push(
        `--color-${name}-${step}:${own >= target ? color : shade(color, own, target)}`,
      )
  }
  return rules.length > 0 ? `:root{${rules.join(';')}}` : ''
}
