// Runs the Guildhall addon against a fake game client (tests/addon.test.lua)
// in a Lua interpreter, since the real client is not available outside the game.
// Run with: npm run test:addon
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { lua, lauxlib, lualib, to_luastring } = createRequire(import.meta.url)(
  'fengari',
)

const read = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

// The game loads an addon file as a function called with its name and a
// shared table; the test file marks where that call goes.
const addon = read('../addon/Guildhall/Guildhall.lua')
const test = read('./addon.test.lua').replace(
  'ADDON_SOURCE()',
  `(function(...)\n${addon}\nend)("Guildhall", {})`,
)

const state = lauxlib.luaL_newstate()
lualib.luaL_openlibs(state)
if (lauxlib.luaL_dostring(state, to_luastring(test)) !== 0) {
  console.error(`Addon test failed: ${lua.lua_tojsstring(state, -1)}`)
  process.exit(1)
}
