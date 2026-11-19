-- Guildhall: records guild data for the guild's website.
--
-- Writes to SavedVariables, one record per guild this account is in:
--   GuildhallDB.guilds["Guild - Realm"].roster   every member, online or not
--   GuildhallDB.guilds["Guild - Realm"].bank     each bank tab you have opened
-- The game only writes SavedVariables on logout or /reload. After that the
-- website's sync script (or its upload page) reads the file.
--
-- Nothing here is sent anywhere by the addon itself, and officer notes are
-- never recorded.

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

-- The record for the guild this character is in, or nil when it has none
-- (or the game has not loaded the guild yet).
local function guildRecord()
    if not db or not IsInGuild or not IsInGuild() then return nil end
    local name = GetGuildInfo("player")
    if type(name) ~= "string" or name == "" then return nil end
    local realm = GetRealmName()
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
    say("/reload or log out, then sync, to send this to the website.")
end

local frame = CreateFrame("Frame")
-- A client without one of these events refuses to register it; carry on.
for _, event in ipairs({
    "ADDON_LOADED", "PLAYER_ENTERING_WORLD", "GUILD_ROSTER_UPDATE",
    "GUILDBANKBAGSLOTS_CHANGED"
}) do pcall(frame.RegisterEvent, frame, event) end

frame:SetScript("OnEvent", function(_, event, arg1)
    if event == "ADDON_LOADED" then
        if arg1 ~= "Guildhall" then return end
        GuildhallDB = GuildhallDB or {}
        db = GuildhallDB
        db.version = 1
        db.guilds = db.guilds or {}
    elseif not db then
        return
    elseif event == "PLAYER_ENTERING_WORLD" then
        requestRoster()
    elseif event == "GUILD_ROSTER_UPDATE" then
        scanRoster(false)
    elseif event == "GUILDBANKBAGSLOTS_CHANGED" then
        scanBankTab()
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
    elseif command == "" or command == "status" then
        status()
    else
        say("/gh status shows what is saved; /gh scan saves the roster now.")
    end
end
