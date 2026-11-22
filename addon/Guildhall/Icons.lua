-- Guildhall icons: saves what the game shows for every item and spell in the
-- website's recipe list (RecipeIds.lua), so the site can show the same thing:
-- the icon of each, and for the things recipes make, the tooltip (stats,
-- "Use:" text) and the quality. Only the person maintaining the site needs
-- this, with /gh icons; nothing here runs on its own.
--
-- Writes GuildhallDB.icons:
--   items[itemId], spells[spellId]   icon: a file id, or a path in old clients
--   quality[itemId]                  0 poor .. 4 epic
--   tips[itemId]                     tooltip lines; "left\tright" when a line
--                                    has text on both sides
--   spellText[spellId]               what an enchantment does

local _, shared = ...

-- Calls a client function that may not exist or may fail; nil either way.
local function try(fn, ...)
    if type(fn) ~= "function" then return nil end
    local ok, a, b, c = pcall(fn, ...)
    if ok then return a, b, c end
end

-- A hidden tooltip, for clients without C_TooltipInfo.
local scanner
local function scannedLines(id)
    if not CreateFrame or not UIParent then return nil end
    if not scanner then
        local ok, frame = pcall(CreateFrame, "GameTooltip",
                                "GuildhallScanTooltip", UIParent,
                                "GameTooltipTemplate")
        if not ok or not frame then return nil end
        scanner = frame
    end
    scanner:SetOwner(UIParent, "ANCHOR_NONE")
    if not pcall(scanner.SetHyperlink, scanner, "item:" .. id) then return nil end
    local lines = {}
    for i = 1, scanner:NumLines() or 0 do
        local left = _G["GuildhallScanTooltipTextLeft" .. i]
        local right = _G["GuildhallScanTooltipTextRight" .. i]
        lines[#lines + 1] = {
            leftText = left and left:GetText(),
            rightText = right and right:IsShown() and right:GetText() or nil
        }
    end
    scanner:Hide()
    return lines
end

-- The item's tooltip as a list of strings, or nil while the client is still
-- fetching the item from the server.
local function tooltip(id)
    local data = try(C_TooltipInfo and C_TooltipInfo.GetItemByID, id)
    local lines = type(data) == "table" and data.lines or scannedLines(id)
    if type(lines) ~= "table" or #lines == 0 then return nil end
    local out = {}
    for _, line in ipairs(lines) do
        local left, right = line.leftText, line.rightText
        if type(left) == "string" and left ~= "" and left ~= " " then
            if type(right) == "string" and right ~= "" then
                left = left .. "\t" .. right
            end
            -- Colour codes and textures mean nothing on a web page.
            left = left:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
                       :gsub("|T.-|t", ""):gsub("|A.-|a", "")
            out[#out + 1] = left
        end
    end
    -- The first line is the name; a placeholder there means "not loaded".
    if #out == 0 or (RETRIEVING_ITEM_INFO and out[1] == RETRIEVING_ITEM_INFO) then
        return nil
    end
    return out
end

-- Returns how many icons are saved, how many ids the client does not know,
-- and how many tooltips it is still fetching (run it again for those).
function shared.saveIcons()
    GuildhallDB = GuildhallDB or {}
    -- Kept between runs, so a second run only has to fill the gaps.
    local saved = GuildhallDB.icons or {}
    saved.items, saved.spells = saved.items or {}, saved.spells or {}
    saved.quality, saved.tips = saved.quality or {}, saved.tips or {}
    saved.spellText = saved.spellText or {}
    GuildhallDB.icons = saved

    local found, missing, waiting = 0, 0, 0
    local function icon(into, id, first, second)
        local value = try(first, id) or try(second, id)
        if value then
            into[id] = value
            found = found + 1
        else
            missing = missing + 1
        end
    end
    for _, id in ipairs(shared.ITEMS or {}) do
        icon(saved.items, id, C_Item and C_Item.GetItemIconByID, GetItemIcon)
    end
    for _, id in ipairs(shared.SPELLS or {}) do
        icon(saved.spells, id, C_Spell and C_Spell.GetSpellTexture,
             GetSpellTexture)
        local text = try(C_Spell and C_Spell.GetSpellDescription, id) or
                         try(GetSpellDescription, id)
        if type(text) == "string" and text ~= "" then
            saved.spellText[id] = text
        end
    end
    for _, id in ipairs(shared.MADE or {}) do
        local lines = tooltip(id)
        if lines then
            saved.tips[id] = lines
            local _, _, quality = try(GetItemInfo, id)
            saved.quality[id] = quality or
                                    try(C_Item and C_Item.GetItemQualityByID, id) or
                                    saved.quality[id]
        elseif not saved.tips[id] then
            waiting = waiting + 1
            -- Asks the server for it, ready for the next run.
            try(C_Item and C_Item.RequestLoadItemDataByID, id)
        end
    end
    return found, missing, waiting
end
