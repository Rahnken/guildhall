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
SlashCmdList = {}

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
SlashCmdList["GUILDHALL"]("status"); SlashCmdList["GUILDHALL"]("scan"); SlashCmdList["GUILDHALL"]("wat")
io.write("addon logic OK\n")
