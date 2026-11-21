-- Guildhall: records guild data for the guild's website.
--
-- Writes to SavedVariables, one record per guild this account is in:
--   GuildhallDB.guilds["Guild - Realm"].roster   every member, online or not
--   GuildhallDB.guilds["Guild - Realm"].bank     each bank tab you have opened
-- and one record per character you play:
--   GuildhallDB.characters["Name - Realm"].professions   levels and recipes
-- The game only writes SavedVariables on logout or /reload. After that the
-- website's sync script (or its upload page) reads the file.
--
-- Nothing here is sent anywhere by the addon itself, and officer notes are
-- never recorded.

-- The table the game shares between this addon's files; Icons.lua puts
-- saveIcons in it.
local _, shared = ...

local PREFIX = "|cff7dd3fcGuildhall|r: "
-- The roster event fires constantly in a busy guild; one capture every few
-- minutes is plenty.
local SCAN_EVERY = 300
local BANK_SLOTS = MAX_GUILDBANK_SLOTS_PER_TAB or 98

local db
local lastScan = 0
-- Set while we have switched "show offline members" on to read everyone.
local forcedOffline, previousOffline = false, nil
-- Set by /gh scan so the next saved roster is reported in chat.
local announce = false

local function say(text) print(PREFIX .. text) end

local function ago(stamp)
    if not stamp then return "never" end
    local minutes = math.floor((time() - stamp) / 60)
    if minutes < 1 then return "just now" end
    if minutes < 120 then return minutes .. " min ago" end
    return math.floor(minutes / 60) .. " h ago"
end

-- Forever characters have a surname, which UnitName returns second.
local function playerName()
    local first, surname = UnitName("player")
    if type(surname) == "string" and surname ~= "" then
        return first .. " " .. surname
    end
    return first
end

-- Roster names can carry a "-Realm" suffix; drop it for our own realm.
local function shortName(name)
    if Ambiguate then
        local ok, short = pcall(Ambiguate, name, "none")
        if ok and type(short) == "string" and short ~= "" then return short end
    end
    return name
end

-- The Forever client sometimes reports a blank realm name. The last real one
-- is remembered and used instead, so records do not split in two.
local function realmName()
    local realm = GetRealmName and GetRealmName()
    if type(realm) ~= "string" or realm == "" then
        realm = GetNormalizedRealmName and GetNormalizedRealmName()
    end
    if type(realm) == "string" and realm ~= "" then
        db.realm = realm
        return realm
    end
    return db.realm or ""
end

-- Guild records saved under a blank realm go back into the record for the
-- same guild that has one, keeping whichever roster and bank tabs are newer.
local function adoptBlankRealm()
    local blank = {}
    for key, guild in pairs(db.guilds) do
        if guild.realm == "" then blank[key] = guild end
    end
    for key, from in pairs(blank) do
        local into
        for _, other in pairs(db.guilds) do
            if other.name == from.name and other.realm ~= "" then
                into = other
            end
        end
        if into then
            db.realm = db.realm or into.realm
            if (from.rosterAt or 0) > (into.rosterAt or 0) then
                into.roster, into.rosterAt = from.roster, from.rosterAt
                into.rosterBy, into.total = from.rosterBy, from.total
            end
            into.bank = into.bank or {tabs = {}}
            for i, tab in pairs(from.bank and from.bank.tabs or {}) do
                local have = into.bank.tabs[i]
                if not have or (tab.scannedAt or 0) > (have.scannedAt or 0) then
                    into.bank.tabs[i] = tab
                    into.bank.tabCount = from.bank.tabCount
                    into.bank.money = from.bank.money
                end
            end
            db.guilds[key] = nil
        end
    end
end

-- The record for the guild this character is in, or nil when it has none
-- (or the game has not loaded the guild yet).
local function guildRecord()
    if not db or not IsInGuild or not IsInGuild() then return nil end
    local name = GetGuildInfo("player")
    if type(name) ~= "string" or name == "" then return nil end
    local realm = realmName()
    local key = name .. " - " .. realm
    local guild = db.guilds[key]
    if not guild then
        guild = {name = name, realm = realm, bank = {tabs = {}}}
        db.guilds[key] = guild
    end
    guild.faction = UnitFactionGroup("player")
    return guild
end

---------------------------------------------------------------------------
-- Roster
---------------------------------------------------------------------------

local function requestRoster()
    if C_GuildInfo and C_GuildInfo.GuildRoster then
        C_GuildInfo.GuildRoster()
    elseif GuildRoster then
        GuildRoster()
    end
end

-- Every member the client will currently tell us about, and how many the
-- guild has. The two differ while offline members are hidden.
local function readRoster()
    local total = GetNumGuildMembers() or 0
    local members = {}
    for i = 1, total do
        local name, rank, rankIndex, level, _, zone, note, _, online, _,
              classFile = GetGuildRosterInfo(i)
        if type(name) == "string" and name ~= "" then
            local hours
            if not online and GetGuildRosterLastOnline then
                local years, months, days, h = GetGuildRosterLastOnline(i)
                if years then
                    hours = ((years * 365 + (months or 0) * 30 + (days or 0)) *
                                24) + (h or 0)
                end
            end
            members[#members + 1] = {
                name = shortName(name),
                rank = rank or "",
                rankIndex = rankIndex or 0,
                level = level or 0,
                class = classFile or "",
                zone = zone or "",
                note = note or "",
                online = online and true or false,
                lastOnlineHours = hours
            }
        end
    end
    return members, total
end

local function restoreOfflineSetting()
    if forcedOffline then
        forcedOffline = false
        if previousOffline == false and SetGuildRosterShowOffline then
            SetGuildRosterShowOffline(false)
        end
    end
end

-- Saves the roster, but only a complete one: the website removes members
-- who are missing from an upload, so a partial list would look like people
-- leaving.
local function scanRoster(force)
    if force then announce = true end
    if not force and not forcedOffline and time() - lastScan < SCAN_EVERY then
        return
    end
    local guild = guildRecord()
    if not guild then return end

    local members, total = readRoster()
    if total == 0 then return end
    if #members < total then
        -- Offline members are hidden. Show them for a moment and read again
        -- when the game sends the full list.
        if not forcedOffline and SetGuildRosterShowOffline then
            forcedOffline = true
            previousOffline = GetGuildRosterShowOffline and
                                  GetGuildRosterShowOffline() or false
            SetGuildRosterShowOffline(true)
            requestRoster()
        end
        return
    end

    guild.roster = members
    guild.total = total
    guild.rosterAt = time()
    guild.rosterBy = playerName()
    lastScan = time()
    restoreOfflineSetting()
    if announce then
        announce = false
        say("roster saved: " .. total .. " members.")
    end
end

---------------------------------------------------------------------------
-- Guild bank
---------------------------------------------------------------------------

-- Records the bank tab that is open. The game only knows a tab's contents
-- once you have clicked on it, so each tab is saved as you view it.
local function scanBankTab()
    if not GetCurrentGuildBankTab or not GetGuildBankItemLink then return end
    local guild = guildRecord()
    if not guild then return end
    local tab = GetCurrentGuildBankTab()
    if type(tab) ~= "number" or tab < 1 then return end
    local tabCount = GetNumGuildBankTabs and GetNumGuildBankTabs() or nil
    if tabCount and tab > tabCount then return end

    local name, _, viewable
    if GetGuildBankTabInfo then name, _, viewable = GetGuildBankTabInfo(tab) end
    if viewable == false then return end

    local items = {}
    for slot = 1, BANK_SLOTS do
        local link = GetGuildBankItemLink(tab, slot)
        if type(link) == "string" then
            local id = tonumber(link:match("item:(%d+)"))
            if id then
                local _, count = GetGuildBankItemInfo(tab, slot)
                items[#items + 1] = {
                    slot = slot,
                    id = id,
                    name = link:match("%[(.-)%]") or "",
                    count = count or 1
                }
            end
        end
    end

    guild.bank = guild.bank or {tabs = {}}
    guild.bank.tabs[tab] = {
        index = tab,
        name = (type(name) == "string" and name ~= "") and name or
            ("Tab " .. tab),
        scannedAt = time(),
        items = items
    }
    guild.bank.tabCount = tabCount
    guild.bank.money = GetGuildBankMoney and GetGuildBankMoney() or nil
end

---------------------------------------------------------------------------
-- Professions
---------------------------------------------------------------------------

-- The skills worth recording; everything else on the skills page (weapons,
-- languages, riding) is ignored.
local PROFESSIONS = {
    ["Alchemy"] = true, ["Blacksmithing"] = true, ["Cooking"] = true,
    ["Enchanting"] = true, ["Engineering"] = true, ["First Aid"] = true,
    ["Fishing"] = true, ["Herbalism"] = true, ["Leatherworking"] = true,
    ["Mining"] = true, ["Skinning"] = true, ["Tailoring"] = true
}

-- The record for the character being played.
local function characterRecord()
    if not db then return nil end
    local name, realm = playerName(), realmName()
    if type(name) ~= "string" or name == "" then return nil end
    local key = name .. " - " .. realm
    local character = db.characters[key]
    if not character then
        character = {name = name, realm = realm, professions = {}}
        db.characters[key] = character
    end
    return character
end

local function professionRecord(character, name)
    local profession = character.professions[name]
    if not profession then
        profession = {recipes = {}}
        character.professions[name] = profession
    end
    return profession
end

-- Calls a client function that may not exist or may fail; nil either way.
local function try(fn, ...)
    if type(fn) ~= "function" then return nil end
    local ok, a, b, c, d = pcall(fn, ...)
    if ok then return a, b, c, d end
end

-- Reads profession levels, which needs no window open. Clients differ in
-- where they keep them: the old skills page, the newer profession book, or
-- both. Returns true when the list read is surely complete; a profession
-- missing from a complete list has been dropped, so it is forgotten.
local function scanSkills()
    local character = characterRecord()
    if not character then return false end
    local found, any, complete = {}, false, false
    local function note(name, rank, maxRank)
        if type(name) ~= "string" or not PROFESSIONS[name] then return end
        found[name], any = true, true
        local profession = professionRecord(character, name)
        profession.skill = rank or 0
        profession.max = maxRank or 0
        profession.scannedAt = time()
    end
    if GetNumSkillLines and GetSkillLineInfo then
        local lines = GetNumSkillLines() or 0
        complete = lines > 0
        for i = 1, lines do
            local name, isHeader, isExpanded, rank, _, _, maxRank =
                GetSkillLineInfo(i)
            if isHeader then
                -- A collapsed section hides its skills from this list.
                if not isExpanded then complete = false end
            else
                note(name, rank, maxRank)
            end
        end
    end
    if GetProfessions and GetProfessionInfo then
        -- Two main professions, then archaeology, fishing, cooking, first
        -- aid; any of them can be missing.
        local book = {GetProfessions()}
        for slot = 1, 6 do
            if book[slot] then
                local name, _, rank, maxRank = try(GetProfessionInfo, book[slot])
                note(name, rank, maxRank)
            end
        end
        -- Just after login the book can still be empty.
        complete = complete or any
    end
    if complete then
        for name in pairs(character.professions) do
            if not found[name] then character.professions[name] = nil end
        end
    end
    return complete
end

-- What the last look at a profession window found, for /gh status.
local lastWindow = "no profession window seen yet"

-- Adds recipes ({name, id} pairs) read from a profession window to what is
-- already saved. Recipes are added, never removed: a search or a filter hides
-- some of the list, and a learned recipe stays learned for as long as the
-- profession does.
local function saveRecipes(name, rank, maxRank, list)
    if type(name) ~= "string" or not PROFESSIONS[name] then
        lastWindow = "window for '" .. tostring(name) .. "' ignored"
        return
    end
    local character = characterRecord()
    if not character then return end
    -- The window can show a profession this character does not have (a chat
    -- link, a guild member's list).
    if scanSkills() and not character.professions[name] then
        lastWindow = name .. " is not this character's profession"
        return
    end
    local profession = professionRecord(character, name)
    local added = 0
    for _, entry in ipairs(list) do
        local recipe, id = entry[1], entry[2]
        if type(recipe) == "string" and recipe ~= "" then
            if not profession.recipes[recipe] then added = added + 1 end
            profession.recipes[recipe] = id or profession.recipes[recipe] or
                                             true
        end
    end
    if rank and rank > 0 then
        profession.skill, profession.max = rank, maxRank or profession.max
    end
    profession.skill = profession.skill or 0
    profession.max = profession.max or 0
    profession.scannedAt = time()
    lastWindow = name .. ": " .. #list .. " recipe(s) read"
    if added > 0 then
        say(name .. ": " .. added .. " new recipe(s) saved.")
    end
end

-- "enchant:3755" or "item:4238": what the game calls the recipe, so the
-- website does not have to match it by name.
local function linkId(link)
    return type(link) == "string" and link:match("|H(%a+:%d+)") or nil
end

-- True when the window shows somebody else's recipes.
local function foreignWindow()
    local T = type(C_TradeSkillUI) == "table" and C_TradeSkillUI or {}
    return try(T.IsTradeSkillLinked) or try(T.IsTradeSkillGuild) or
               try(T.IsTradeSkillGuildMember) or try(T.IsNPCCrafting) or
               try(IsTradeSkillLinked) or try(IsTradeSkillGuild) or false
end

-- The newer profession window lists every recipe of the profession, learned
-- or not, whatever the window's filters say.
local function scanRecipeList()
    local T = type(C_TradeSkillUI) == "table" and C_TradeSkillUI or nil
    if not T or not T.GetAllRecipeIDs or not T.GetRecipeInfo then return end
    local ids = try(T.GetAllRecipeIDs)
    if type(ids) ~= "table" or #ids == 0 then return end
    local name, rank, maxRank
    local base = try(T.GetBaseProfessionInfo)
    if type(base) == "table" then
        name, rank, maxRank = base.professionName, base.skillLevel,
                              base.maxSkillLevel
    end
    if type(name) ~= "string" then
        -- Either (id, name, rank, max) or (name, rank, max).
        local a, b, c, d = try(T.GetTradeSkillLine)
        if type(a) == "number" then
            name, rank, maxRank = b, c, d
        else
            name, rank, maxRank = a, b, c
        end
    end
    local list = {}
    for _, id in ipairs(ids) do
        local info = try(T.GetRecipeInfo, id)
        if type(info) == "table" and info.learned == true then
            list[#list + 1] = {info.name, "spell:" .. id}
        end
    end
    saveRecipes(name, rank, maxRank, list)
end

-- The older trade skill window, which most professions use.
local function scanOldWindow()
    if not GetTradeSkillLine or not GetNumTradeSkills or not GetTradeSkillInfo then
        return
    end
    local name, rank, maxRank = GetTradeSkillLine()
    if type(name) ~= "string" or name == "UNKNOWN" then return end
    local link = GetTradeSkillRecipeLink or GetTradeSkillItemLink
    local list = {}
    for i = 1, GetNumTradeSkills() or 0 do
        local recipe, kind = GetTradeSkillInfo(i)
        if kind ~= "header" and kind ~= "subheader" then
            list[#list + 1] = {recipe, link and linkId(link(i))}
        end
    end
    saveRecipes(name, rank, maxRank, list)
end

local function scanTradeSkill()
    if foreignWindow() then
        lastWindow = "somebody else's recipes, ignored"
        return
    end
    scanRecipeList()
    scanOldWindow()
end

-- Enchanting has its own "craft" window in older clients.
local function scanCraft()
    if not GetCraftDisplaySkillLine or not GetNumCrafts or not GetCraftInfo then
        return
    end
    local name, rank, maxRank = GetCraftDisplaySkillLine()
    if type(name) ~= "string" then return end
    local link = GetCraftRecipeLink or GetCraftItemLink
    local list = {}
    for i = 1, GetNumCrafts() or 0 do
        local recipe, _, kind = GetCraftInfo(i)
        if kind ~= "header" then
            list[#list + 1] = {recipe, link and linkId(link(i))}
        end
    end
    saveRecipes(name, rank, maxRank, list)
end

-- The window's contents arrive a moment after it opens, in several events;
-- one look shortly after the last of them is enough.
local windowPending = false
local function scanWindowsSoon()
    if not (C_Timer and C_Timer.After) then
        scanTradeSkill()
        scanCraft()
        return
    end
    if windowPending then return end
    windowPending = true
    C_Timer.After(0.5, function()
        windowPending = false
        scanTradeSkill()
        scanCraft()
    end)
end

-- Which ways of reading professions this client has, for /gh status.
local function clientSupport()
    local T = type(C_TradeSkillUI) == "table" and C_TradeSkillUI or {}
    local function yes(v) return v and "yes" or "no" end
    return "skills page " .. yes(GetNumSkillLines and GetSkillLineInfo) ..
               ", profession book " .. yes(GetProfessions and GetProfessionInfo) ..
               ", recipe list " .. yes(T.GetAllRecipeIDs and T.GetRecipeInfo) ..
               ", old window " .. yes(GetTradeSkillLine and GetNumTradeSkills) ..
               ", craft window " .. yes(GetCraftDisplaySkillLine and GetNumCrafts)
end

---------------------------------------------------------------------------
-- Events and commands
---------------------------------------------------------------------------

local function status()
    local guild = guildRecord()
    if not guild then
        say("this character is not in a guild.")
        return
    end
    say(guild.name .. ": roster saved " .. ago(guild.rosterAt) ..
            (guild.total and (" (" .. guild.total .. " members)") or "") .. ".")
    local tabs = 0
    for _ in pairs(guild.bank and guild.bank.tabs or {}) do tabs = tabs + 1 end
    say(tabs .. " bank tab(s) saved. Open a tab at the guild bank to save it.")
    local character = characterRecord()
    local listed = {}
    for name, profession in pairs(character and character.professions or {}) do
        local recipes = 0
        for _ in pairs(profession.recipes or {}) do recipes = recipes + 1 end
        listed[#listed + 1] = name .. " " .. (profession.skill or 0) .. " (" ..
                                  recipes .. " recipes)"
    end
    table.sort(listed)
    say(#listed > 0 and (table.concat(listed, ", ") ..
            ". Open a profession to save its recipes.") or
            "no professions saved for this character yet.")
    say("This client: " .. clientSupport() .. ". Last window: " .. lastWindow ..
            ".")
    say("/reload or log out, then sync, to send this to the website.")
end

local frame = CreateFrame("Frame")
-- A client without one of these events refuses to register it; carry on.
for _, event in ipairs({
    "ADDON_LOADED", "PLAYER_ENTERING_WORLD", "GUILD_ROSTER_UPDATE",
    "GUILDBANKBAGSLOTS_CHANGED", "SKILL_LINES_CHANGED", "TRADE_SKILL_SHOW",
    "TRADE_SKILL_UPDATE", "TRADE_SKILL_LIST_UPDATE",
    "TRADE_SKILL_DATA_SOURCE_CHANGED", "NEW_RECIPE_LEARNED", "CRAFT_SHOW",
    "CRAFT_UPDATE"
}) do pcall(frame.RegisterEvent, frame, event) end

frame:SetScript("OnEvent", function(_, event, arg1)
    if event == "ADDON_LOADED" then
        if arg1 ~= "Guildhall" then return end
        GuildhallDB = GuildhallDB or {}
        db = GuildhallDB
        db.version = 1
        db.guilds = db.guilds or {}
        db.characters = db.characters or {}
        adoptBlankRealm()
    elseif not db then
        return
    elseif event == "PLAYER_ENTERING_WORLD" then
        requestRoster()
        scanSkills()
    elseif event == "SKILL_LINES_CHANGED" then
        scanSkills()
    elseif event == "GUILD_ROSTER_UPDATE" then
        scanRoster(false)
    elseif event == "GUILDBANKBAGSLOTS_CHANGED" then
        scanBankTab()
    else
        -- Every other event is a profession window opening or changing.
        scanWindowsSoon()
    end
end)

SLASH_GUILDHALL1 = "/guildhall"
SLASH_GUILDHALL2 = "/gh"
SlashCmdList["GUILDHALL"] = function(msg)
    local command = (msg or ""):lower():match("^%s*(%S*)")
    if command == "scan" then
        lastScan = 0
        requestRoster()
        scanRoster(true)
        scanBankTab()
        scanSkills()
        scanTradeSkill()
        scanCraft()
    elseif command == "icons" then
        if type(shared) == "table" and shared.saveIcons then
            local found, missing, waiting = shared.saveIcons()
            say(found .. " icon(s) saved, " .. missing ..
                    " unknown to this client.")
            say(waiting > 0 and
                    (waiting .. " item(s) still loading from the server: " ..
                        "run /gh icons again in a few seconds.") or
                    "every item's tooltip is saved. /reload to write it out.")
        end
    elseif command == "sync" then
        -- The game only writes the addon's data when the interface reloads;
        -- the website's watcher (npm run sync:watch) uploads it from there.
        scanSkills()
        scanTradeSkill()
        scanCraft()
        if ReloadUI then
            ReloadUI()
        else
            say("type /reload to save.")
        end
    elseif command == "" or command == "status" then
        status()
    else
        say("/gh status shows what is saved; /gh scan saves the roster now; " ..
                "/gh sync reloads the interface so the game saves it.")
    end
end
