/**
 * Reader for WoW SavedVariables files: a list of `Name = <literal>` assignments
 * where the literals are Lua tables, strings, numbers, booleans and nil.
 *
 * Tables with only positional entries become arrays; anything else becomes a
 * prototype-less object keyed by the stringified Lua key.
 */

export type LuaValue =
  string | number | boolean | null | Array<LuaValue> | LuaObject
export type LuaObject = { [key: string]: LuaValue }

const ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  a: '\x07',
  b: '\b',
  f: '\f',
  v: '\v',
}

export function parseSavedVariables(source: string): LuaObject {
  let pos = 0
  const fail = (msg: string): never => {
    const line = source.slice(0, pos).split('\n').length
    throw new Error(`Lua parse error on line ${line}: ${msg}`)
  }

  const skip = () => {
    for (;;) {
      const c = source.charCodeAt(pos)
      // whitespace
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0xfeff) pos++
      else if (c === 45 && source.charCodeAt(pos + 1) === 45) {
        const end = source.indexOf('\n', pos)
        pos = end === -1 ? source.length : end
      } else return
    }
  }

  const name = (): string => {
    const m = /[A-Za-z_][A-Za-z0-9_]*/y
    m.lastIndex = pos
    const found = m.exec(source)
    if (!found) return fail('expected a name')
    pos = m.lastIndex
    return found[0]
  }

  const string = (): string => {
    const quote = source[pos++]
    let out = ''
    for (;;) {
      // Copy the run up to the next quote or backslash in one slice.
      let end = pos
      while (end < source.length) {
        const c = source[end]
        if (c === quote || c === '\\') break
        end++
      }
      if (end >= source.length) return fail('unterminated string')
      out += source.slice(pos, end)
      pos = end
      if (source[pos] === quote) {
        pos++
        return out
      }
      pos++ // backslash
      const e = source[pos]
      if (e >= '0' && e <= '9') {
        const m = /\d{1,3}/y
        m.lastIndex = pos
        const digits = m.exec(source)![0]
        out += String.fromCharCode(Number(digits))
        pos += digits.length
      } else if (e === '\r') {
        out += '\n'
        pos += source[pos + 1] === '\n' ? 2 : 1
      } else {
        out += ESCAPES[e] ?? e
        pos++
      }
    }
  }

  const number = (): number => {
    const m = /-?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/y
    m.lastIndex = pos
    const found = m.exec(source)
    if (found) {
      pos = m.lastIndex
      return Number(found[0])
    }
    // WoW writes non-finite numbers as inf, -inf, nan or -nan(ind).
    const odd = /-?(?:inf|nan)(?:\(ind\))?/y
    odd.lastIndex = pos
    const special = odd.exec(source)
    if (!special) return fail('expected a value')
    pos = odd.lastIndex
    if (special[0].includes('nan')) return NaN
    return special[0].startsWith('-') ? -Infinity : Infinity
  }

  const table = (): LuaValue => {
    pos++ // {
    const list: Array<LuaValue> = []
    let keyed: LuaObject | null = null
    for (;;) {
      skip()
      if (pos >= source.length) return fail('unterminated table')
      const c = source[pos]
      if (c === '}') {
        pos++
        break
      }
      let key: string | null = null
      if (c === '[') {
        pos++
        skip()
        key = String(value())
        skip()
        if (source[pos++] !== ']') return fail("expected ']'")
        skip()
        if (source[pos++] !== '=') return fail("expected '='")
      } else if (/[A-Za-z_]/.test(c)) {
        // Either `name = value` or a bare true/false/nil.
        const start = pos
        const word = name()
        skip()
        if (source[pos] === '=' && source[pos + 1] !== '=') {
          key = word
          pos++
        } else pos = start
      }
      skip()
      const v = value()
      if (key === null) list.push(v)
      else (keyed ??= Object.create(null) as LuaObject)[key] = v
      skip()
      if (source[pos] === ',' || source[pos] === ';') pos++
    }
    if (!keyed) return list
    // Mixed table: positional entries take Lua's 1-based indexes.
    list.forEach((v, i) => (keyed[String(i + 1)] = v))
    return keyed
  }

  const value = (): LuaValue => {
    const c = source[pos]
    if (c === '{') return table()
    if (c === '"' || c === "'") return string()
    if (source.startsWith('true', pos)) return ((pos += 4), true)
    if (source.startsWith('false', pos)) return ((pos += 5), false)
    if (source.startsWith('nil', pos)) return ((pos += 3), null)
    return number()
  }

  const out = Object.create(null) as LuaObject
  for (;;) {
    skip()
    if (pos >= source.length) return out
    const variable = name()
    skip()
    if (source[pos++] !== '=') fail("expected '='")
    skip()
    out[variable] = value()
  }
}

/** A keyed table's entries; arrays and scalars yield nothing. */
export function luaEntries(v: LuaValue | undefined): Array<[string, LuaValue]> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? Object.entries(v)
    : []
}

export const luaString = (v: LuaValue | undefined): string | null =>
  typeof v === 'string' ? v : null

export const luaNumber = (v: LuaValue | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
