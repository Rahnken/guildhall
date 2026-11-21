// Builds src/data/recipes.json from the profession recipes that ship with the
// OneForAll addon (GPL-3.0-or-later, by Smoergi), which extracted them from
// the WoW Forever client database. Rerun after a game patch, once OneForAll
// has updated: npm run recipes:import
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const { lua, lauxlib, lualib, to_luastring } = createRequire(import.meta.url)(
  'fengari',
)

const wowDir =
  process.env.WOW_FOREVER_DIR?.trim() ||
  'C:/Program Files (x86)/World of Warcraft/_forever_'
const addon = join(wowDir, 'Interface', 'AddOns', 'OneForAll')
const folder = join(addon, 'Data', 'Professions')
if (!existsSync(folder)) {
  console.error(
    `OneForAll is not installed in ${wowDir}. Set WOW_FOREVER_DIR in .env.local.`,
  )
  process.exit(1)
}

// Each file fills FLT.PROFESSION_RECIPES[profession]; the game calls it with
// the addon's name and that shared table. JSON is the way back out of Lua.
const files = readdirSync(folder)
  .filter((file) => file.endsWith('.lua'))
  .map(
    (file) =>
      `(function(...)\n${readFileSync(join(folder, file), 'utf8')}\nend)("OneForAll", FLT)`,
  )
const program = `
local FLT = {};
${files.join(';\n')};
local backslash = string.char(92)
local function text(s)
  local escaped = s:gsub('[%c"' .. backslash .. ']', function(c)
    return backslash .. string.format('u%04x', c:byte())
  end)
  return '"' .. escaped .. '"'
end
local function json(v)
  if type(v) == 'table' then
    local parts = {}
    if #v > 0 then
      for _, item in ipairs(v) do parts[#parts + 1] = json(item) end
      return '[' .. table.concat(parts, ',') .. ']'
    end
    for key, item in pairs(v) do parts[#parts + 1] = text(tostring(key)) .. ':' .. json(item) end
    return '{' .. table.concat(parts, ',') .. '}'
  end
  if type(v) == 'string' then return text(v) end
  return tostring(v)
end
return json(FLT.PROFESSION_RECIPES)
`

const state = lauxlib.luaL_newstate()
lualib.luaL_openlibs(state)
if (lauxlib.luaL_dostring(state, to_luastring(program)) !== 0) {
  console.error(`Could not read OneForAll: ${lua.lua_tojsstring(state, -1)}`)
  process.exit(1)
}
const source = JSON.parse(lua.lua_tojsstring(state, -1))

const recipes = []
for (const profession of Object.keys(source).sort())
  for (const r of source[profession])
    recipes.push({
      profession,
      spellId: r.s,
      name: r.n,
      category: r.cat,
      // What it makes; enchants on gear make no item.
      ...(r.i ? { itemId: r.i } : {}),
      ...(r.c ? { makes: r.c } : {}),
      // Skill needed to learn it.
      ...(r.req ? { skill: r.req } : {}),
      // Known as soon as the profession is learned.
      ...(r.start ? { start: true } : {}),
      // Taught by this recipe item, not by a trainer.
      ...(r.ri ? { recipeItemId: r.ri } : {}),
      // "A" or "H" when only one faction can make it.
      ...(r.side ? { side: r.side } : {}),
      reagents: (r.r ?? []).map(([itemId, count, name]) => ({
        itemId,
        count,
        name,
      })),
    })

const version =
  /^## Version: (.+)$/m
    .exec(readFileSync(join(addon, 'OneForAll.toc'), 'utf8'))?.[1]
    .trim() ?? 'unknown'
const out = join(import.meta.dirname, '..', 'src', 'data', 'recipes.json')
// One recipe per line, so a patch shows up as a readable diff.
writeFileSync(
  out,
  `{\n"source": ${JSON.stringify(`OneForAll ${version}`)},\n"recipes": [\n${recipes.map((r) => JSON.stringify(r)).join(',\n')}\n]\n}\n`,
)
const counts = {}
for (const r of recipes) counts[r.profession] = (counts[r.profession] ?? 0) + 1
console.log(`Wrote ${recipes.length} recipes from OneForAll ${version}`)
console.log(counts)
