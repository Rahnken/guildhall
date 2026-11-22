-- Fake game client: 5 members, 2 online, "show offline" starts off.
local showOffline = false
local members = {
  {"Thrall-Testrealm","Guild Master",0,42,"Warrior","Orgrimmar","note","officer secret",true,0,"WARRIOR"},
  {"Hamuul","Member",3,29,"Druid","Mulgore","","",true,0,"DRUID"},
  {"Jaina","Member",3,8,"Mage","Durotar","alt","",false,0,"MAGE"},
  {"Rexxar","Member",3,15,"Hunter","Durotar","","",false,0,"HUNTER"},
  {"Cairne","Officer",1,33,"Warrior","Mulgore","","",false,0,"WARRIOR"},
}
local handler, requests, toggles = nil, 0, 0
local now = 1000000
function time() return now end
function print(...) io.write("  [chat] ", ..., "\n") end
function CreateFrame() return { RegisterEvent = function() end, SetScript = function(_, _, fn) handler = fn end } end
function UnitName() return "Rahn", "Ken" end
function UnitFactionGroup() return "Horde" end
function GetRealmName() return "Testrealm" end
function IsInGuild() return true end
function GetGuildInfo() return "Test Guild", "Officer", 1 end
function Ambiguate(n) return (n:gsub("%-.*$", "")) end
function GetNumGuildMembers() return #members, 2 end
function GetGuildRosterInfo(i)
  local m = members[i]; if not m then return nil end
  if not showOffline and not m[9] then return nil end
  return (table.unpack or unpack)(m)
end
function GetGuildRosterLastOnline(i) if members[i][9] then return nil end return 0, 0, 2, 3 end
function GetGuildRosterShowOffline() return showOffline end
function SetGuildRosterShowOffline(v) showOffline = v; toggles = toggles + 1 end
function GuildRoster() requests = requests + 1 end
function GetCurrentGuildBankTab() return 2 end
function GetNumGuildBankTabs() return 3 end
function GetGuildBankTabInfo(t) return "Materials", "icon", true end
function GetGuildBankItemLink(t, s) if s == 1 or s == 5 then return "|cffffffff|Hitem:2589:0:0|h[Linen Cloth]|h|r" end end
function GetGuildBankItemInfo(t, s) return "tex", s == 1 and 20 or 3 end
function GetGuildBankMoney() return 1234567 end
-- Skills page: a collapsed "Secondary Skills" section hides Cooking at first.
local secondaryOpen = false
local skills = {
  {"Professions", true, true}, {"Tailoring", false, false, 140, 0, 0, 150},
  {"Weapon Skills", true, true}, {"Staves", false, false, 80, 0, 0, 100},
  {"Secondary Skills", true, false},
}
function GetNumSkillLines() return #skills end
function GetSkillLineInfo(i) return (table.unpack or unpack)(skills[i]) end
-- Tailoring window: a header and three recipes, one hidden by a search at first.
local searching = true
local tailoring = {
  {"Bags", "header"}, {"Linen Bag", "optimal", "enchant:3755"},
  {"Cloaks", "header"}, {"Linen Cloak", "easy", "enchant:2387"}, {"Faction Banner", "easy", "enchant:1229504"},
}
function GetTradeSkillLine() return "Tailoring", 142, 150 end
function GetNumTradeSkills() return searching and 2 or #tailoring end
function GetTradeSkillInfo(i) return tailoring[i][1], tailoring[i][2] end
function GetTradeSkillRecipeLink(i) local id = tailoring[i][3]; return id and ("|cffffd000|H" .. id .. "|h[x]|h|r") end
-- Enchanting uses the craft window; a hunter's Beast Training has no skill line.
local craftLine = "Enchanting"
function GetCraftDisplaySkillLine() if craftLine then return craftLine, 30, 75 end end
function GetNumCrafts() return 1 end
function GetCraftInfo(i) return "Runed Copper Rod", "", "optimal" end
SlashCmdList = {}
-- Tabard: black background, white border, a red emblem.
function GetGuildLogoInfo() return 0, 0, 0, 1, 1, 1, 0.8, 0.1, 0.1, "emblem" end
-- What RecipeIds.lua would have loaded; the client knows two of the three.
ADDON_TABLE = { ITEMS = {4238, 11}, SPELLS = {7421}, MADE = {4238, 12} }
C_Item = { GetItemIconByID = function(id) if id == 4238 then return 133639 end end }
function GetSpellTexture(id) return 136244 end
function GetSpellDescription(id) return "Teaches you to enchant." end
function GetItemInfo(id) return "Linen Bag", "link", 1 end
-- Item 12 is not loaded from the server until it has been asked for.
local asked = false
C_Item.RequestLoadItemDataByID = function() asked = true end
C_TooltipInfo = { GetItemByID = function(id)
  if id == 12 and not asked then return { lines = {} } end
  return { lines = { {leftText = "|cffffffffLinen Bag|r"}, {leftText = "6 Slot Bag"}, {leftText = "Bag", rightText = "Cloth"}, {leftText = " "} } }
end }

-- Saved by an earlier version while the client reported no realm.
GuildhallDB = { guilds = {
  ["Test Guild - "] = {name = "Test Guild", realm = "", bank = {tabs = {[7] = {scannedAt = 9, items = {}}}}},
  ["Test Guild - Testrealm"] = {name = "Test Guild", realm = "Testrealm", bank = {tabs = {}}},
} }

ADDON_SOURCE()

local function fire(e, a) handler(nil, e, a) end
fire("ADDON_LOADED", "SomethingElse")
fire("ADDON_LOADED", "Guildhall")
fire("PLAYER_ENTERING_WORLD")
fire("GUILD_ROSTER_UPDATE")           -- sees 2 of 5: switches offline on, asks again
local g = GuildhallDB.guilds["Test Guild - Testrealm"]
assert(g.roster == nil, "must not save a partial roster")
assert(showOffline == true, "should have shown offline members")
fire("GUILD_ROSTER_UPDATE")           -- full list now
assert(#g.roster == 5, "full roster saved")
assert(showOffline == false, "setting restored")
fire("GUILD_ROSTER_UPDATE")           -- the update caused by restoring: throttled
assert(toggles == 2, "no toggle loop, got " .. toggles)
assert(g.roster[1].name == "Thrall" and g.roster[1].class == "WARRIOR")
assert(g.roster[3].lastOnlineHours == 51 and g.roster[1].lastOnlineHours == nil)
for _, m in ipairs(g.roster) do for _, v in pairs(m) do assert(v ~= "officer secret") end end
assert(g.rosterBy == "Rahn Ken" and g.total == 5)
now = now + 100; members[6] = {"Newbie","Member",3,1,"Mage","Durotar","","",true,0,"MAGE"}
fire("GUILD_ROSTER_UPDATE"); assert(#g.roster == 5, "throttled within 5 minutes")
now = now + 300
fire("GUILD_ROSTER_UPDATE"); fire("GUILD_ROSTER_UPDATE"); fire("GUILD_ROSTER_UPDATE")
assert(#g.roster == 6 and showOffline == false, "picked up the new member later")
fire("GUILDBANKBAGSLOTS_CHANGED")
local tab = g.bank.tabs[2]
assert(tab.name == "Materials" and #tab.items == 2 and tab.items[1].id == 2589 and tab.items[1].name == "Linen Cloth" and tab.items[2].count == 3)
assert(g.bank.money == 1234567 and g.bank.tabCount == 3)
local c = GuildhallDB.characters["Rahn Ken - Testrealm"]
assert(c.professions.Tailoring.skill == 140 and c.professions.Tailoring.max == 150, "level read at login")
assert(c.professions.Staves == nil and c.professions.Cooking == nil, "only professions are kept")
skills[2][4] = 142                    -- two skill-ups since login
fire("TRADE_SKILL_SHOW")              -- a search is hiding part of the list
assert(c.professions.Tailoring.recipes["Linen Bag"] == "enchant:3755" and c.professions.Tailoring.recipes["Bags"] == nil)
assert(c.professions.Tailoring.skill == 142, "window level is newer")
searching = false; fire("TRADE_SKILL_UPDATE")
searching = true; fire("TRADE_SKILL_UPDATE")   -- searching again must not forget recipes
local known = 0; for _ in pairs(c.professions.Tailoring.recipes) do known = known + 1 end
assert(known == 3, "recipes add up across scans, got " .. known)
fire("CRAFT_SHOW")
assert(c.professions.Enchanting.recipes["Runed Copper Rod"] == true and c.professions.Enchanting.skill == 30)
craftLine = nil; fire("CRAFT_SHOW")   -- Beast Training: nothing to save, no error
-- Enchanting is not on the skills page, but a section is collapsed: keep it.
fire("SKILL_LINES_CHANGED"); assert(c.professions.Enchanting ~= nil, "nothing dropped while a section is collapsed")
skills[5][3] = true; skills[6] = {"Cooking", false, false, 12, 0, 0, 75}
fire("SKILL_LINES_CHANGED")
assert(c.professions.Enchanting == nil and c.professions.Cooking.skill == 12, "dropped profession forgotten, new one found")
assert(known == 3 and c.professions.Tailoring.recipes["Linen Cloak"] == "enchant:2387")
-- A record an earlier version saved under a blank realm was folded into the real one.
assert(GuildhallDB.guilds["Test Guild - "] == nil and g.bank.tabs[7].scannedAt == 9, "blank-realm record adopted")
-- The client stops reporting its realm: records stay where they were.
function GetRealmName() return "" end
-- A newer client: no skills page or old windows, a profession book and a full recipe list.
GetNumSkillLines, GetTradeSkillLine, GetCraftDisplaySkillLine = nil, nil, nil
function GetProfessions() return 4, nil, nil, nil, 9 end
function GetProfessionInfo(i) if i == 4 then return "Alchemy", "icon", 60, 75 end return "Cooking", "icon", 13, 75 end
local linked = true
local potions = {
  [2330] = {name = "Minor Healing Potion", learned = true}, [2331] = {name = "Minor Mana Potion", learned = false},
  [2332] = {name = "Minor Rejuvenation Potion", learned = true},
}
C_TradeSkillUI = {
  IsTradeSkillLinked = function() return linked end,
  GetAllRecipeIDs = function() return {2330, 2331, 2332} end,
  GetRecipeInfo = function(id) return potions[id] end,
  GetBaseProfessionInfo = function() return {professionName = "Alchemy", skillLevel = 0, maxSkillLevel = 0} end,
}
fire("SKILL_LINES_CHANGED")
assert(c.professions.Alchemy.skill == 60 and c.professions.Cooking.skill == 13 and c.professions.Tailoring == nil, "profession book read")
fire("TRADE_SKILL_LIST_UPDATE")       -- somebody else's linked profession
assert(next(c.professions.Alchemy.recipes) == nil, "a linked profession is not ours")
linked = false; fire("TRADE_SKILL_LIST_UPDATE")
local alchemy = c.professions.Alchemy
assert(alchemy.recipes["Minor Healing Potion"] == "spell:2330" and alchemy.recipes["Minor Mana Potion"] == nil, "only learned recipes")
assert(alchemy.skill == 60, "a level of 0 from the window is not believed")
potions[2330].name = "Elixir"; C_TradeSkillUI.GetBaseProfessionInfo = function() return {professionName = "Jewelcrafting"} end
fire("TRADE_SKILL_LIST_UPDATE"); assert(alchemy.recipes["Elixir"] == nil, "a profession the character lacks is ignored")
SlashCmdList["GUILDHALL"]("status"); SlashCmdList["GUILDHALL"]("scan"); SlashCmdList["GUILDHALL"]("wat")
SlashCmdList["GUILDHALL"]("icons")
local icons = GuildhallDB.icons
assert(icons.items[4238] == 133639 and icons.items[11] == nil and icons.spells[7421] == 136244, "icons saved")
assert(icons.tips[4238][1] == "Linen Bag" and icons.tips[4238][3] == "Bag	Cloth" and #icons.tips[4238] == 3, "tooltip saved without colour codes")
assert(icons.quality[4238] == 1 and icons.spellText[7421] == "Teaches you to enchant." and icons.tips[12] == nil)
SlashCmdList["GUILDHALL"]("icons"); assert(icons.tips[12] ~= nil, "a second run fills in what was loading")
assert(g.tabard.background == "#000000" and g.tabard.border == "#ffffff" and g.tabard.emblem == "#cc1a1a", "tabard colours saved by /gh status")
-- The Forever client gives the channels as 0 to 255.
function GetGuildLogoInfo() return 252, 104, 145, 99, 179, 0, 55, 103, 0, "Emblem_101_15_TU_U", 101 end
function GetGuildTabardFiles() return 1, 2, 180499, 180498, 5, 6 end
C_GuildInfo = { GetGuildTabardInfo = function() return { emblemStyle = 101, emblemFileID = 180499, backgroundColor = {} } end }
SlashCmdList["GUILDHALL"]("status")
assert(g.tabard.background == "#fc6891" and g.tabard.border == "#63b300" and g.tabard.emblem == "#376700", "tabard colours given as 0 to 255")
assert(g.tabard.emblemFile == "Emblem_101_15_TU_U" and g.tabard.emblemIndex == 101 and g.tabard.files[3] == 180499, "which emblem it is")
assert(g.tabard.info.emblemStyle == 101 and g.tabard.info.backgroundColor == nil, "newer tabard description, plain values only")
local reloads = 0; function ReloadUI() reloads = reloads + 1 end
SlashCmdList["GUILDHALL"]("sync"); assert(reloads == 1, "/gh sync reloads the interface")
assert(GuildhallDB.characters["Rahn Ken - "] == nil and GuildhallDB.guilds["Test Guild - "] == nil, "blank realm made no new records")
io.write("addon logic OK\n")
