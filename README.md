<p align="center"><img src="public/logo.svg" alt="Guildhall logo" width="120" /></p>

# Guildhall

A website and Discord bot for a WoW Forever guild. An in-game addon records the guild roster and guild bank; an upload sends them to the site; members sign in with Discord to browse them, or ask the bot from Discord.

Stack: TanStack Start (React 19, Vite), Tailwind CSS v4, Prisma 7 with SQLite. It runs as one small machine on Fly.io with the database on a volume.

The guild's name, description and invite link are data: officers edit them on the Settings page, and `GUILD_NAME`, `GUILD_TAGLINE` and `DISCORD_INVITE_URL` only apply until they first save. The Discord server comes from environment variables.

## How the data gets there

```
Guildhall addon  ->  SavedVariables/Guildhall.lua  ->  sync script or upload page  ->  site  ->  web pages
   (in game)          (written on logout or /reload)                                        ->  Discord slash commands
                                                                                            ->  Discord channel posts
```

Only one person with the addon is needed. Everyone else just uses the site or Discord.

## What is in it

| Page or command      | Who             | What it does                                                                          |
| -------------------- | --------------- | ------------------------------------------------------------------------------------- |
| `/`                  | Anyone          | Public page: guild name, tagline, "Request to join" (your Discord invite) and sign in |
| `/` (signed in)      | Members         | Member count, classes, highest levels                                                 |
| `/roster`            | Members         | Every character: level, class, rank, zone, last seen, public note. Search and sort    |
| `/roster`            | Members         | Say which characters are yours and which is your main; the rest show as its alts      |
| `/crafting`          | Members         | Browse every recipe by profession: materials, what the bank has, who can make it      |
| `/crafting`          | Members         | Upload your own addon file so the site knows your professions and recipes             |
| `/requests`          | Members         | Ask for something to be made; crafters take requests and mark them done               |
| `/bank`              | Members         | Guild bank by tab, with search, and the bank's gold                                   |
| `/sync`              | Officers        | Upload the addon's saved file from the browser; recent upload history                 |
| `/settings`          | Officers        | Edit the guild name, description and Discord invite shown on the public page          |
| `/roster` in Discord | Server members  | Roster summary                                                                        |
| `/who <name>`        | Server members  | Look up a character                                                                   |
| `/bank [item]`       | Server members  | Search the bank, or list its tabs                                                     |
| Channel posts        | Updates channel | Who joined, who left, and who passed a multiple of 10 levels, after each upload       |

Slash command replies are only visible to the person who asked. Change `EPHEMERAL` in `src/routes/api/discord/interactions.ts` to make them public.

## Claiming characters

On the roster, a member clicks "This is mine" on each of their characters. The first becomes their main and the others show as "alt of" it; "Make main" changes which. `/who` in Discord says who plays a character.

Nothing can prove who owns a character, so claims are taken on trust: each one is posted to the updates channel, the member can undo it with "Not mine", and officers see "Remove claim" on everyone's. A claim lasts as long as the character is in the guild.

## Crafting

The Crafting page answers "who can make this?". It lists every recipe by profession, and for each one shows what the item does, the materials, how many of them are in the guild bank, and the guild characters who know it. The address holds the profession and the open recipe (`/crafting?p=Tailoring&r=3755`), so a recipe can be linked to.

**Where the recipes come from.** `src/data/recipes.json` is built by `npm run recipes:import` from the profession data that ships with the [OneForAll](https://www.curseforge.com/wow/addons/oneforall) addon (GPL-3.0-or-later, by Smoergi), which extracted it from the WoW Forever client database. OneForAll must be installed in the game folder to run the import. Rerun it after a game patch, once OneForAll has updated.

**Where "who knows it" comes from.** The Guildhall addon saves each character's professions when they log in, and the recipes of a profession when its window is opened. Any member can then upload their own `Guildhall.lua` on the Crafting page; `npm run sync` sends it too. Rules:

- Only characters on the guild roster are stored.
- A member's upload claims the characters in it that nobody has claimed, and skips characters someone else has claimed.
- Recipes are only ever added to by the addon, because a search or filter in the profession window hides part of the list. Dropping a profession removes it.
- The upload reports recipes the site's list does not have. A lot of those means `recipes.json` is out of date.

**Where the icons and item descriptions come from.** The game itself. This only needs redoing after a game patch or a recipe re-import:

1. `npm run icons:ids` writes the list of items and spells to look up into the addon (`RecipeIds.lua`); then `npm run addon:install`.
2. In game, `/gh icons` saves each one's icon number, and the tooltip and quality of every item a recipe makes. Repeat it until it says every tooltip is saved, then `/reload`.
3. `npm run icons:read` writes those to `src/data/icons.json`.
4. Export the game's icon pictures once with [wow.export](https://github.com/Kruithne/wow.export): open the local installation, Textures tab, search `interface/icons`, select all, Export as PNG.
5. `npm run icons:build` copies the pictures the recipe list needs into `public/icons`, shrunk to 56 pixels, and names any it could not find.

## Requests

A member asks for something to be made with "Request this" on a recipe: how many, which of their characters it goes to, whether they will send the materials, and optionally one crafter to ask. The Requests page lists what is waiting. Any member can take a request with "I'll make it", give it back, and mark it done; the requester can cancel, and officers can finish or cancel anyone's.

Like claims, this runs on trust, and each step is posted to the updates channel. Those posts notify only the person concerned: the crafter who was asked, the requester when their request is taken, given back or done, and the crafter when a request they took is cancelled. A member can have 10 requests waiting at once, and finished ones stay listed for 14 days.

## Local setup

Needs Node 22 or newer.

```bash
npm install
cp .env.example .env.local      # then set SESSION_SECRET (at least 32 characters)
npm run db:migrate              # creates dev.db
npm run db:generate
npm run dev                     # http://localhost:3000
```

With `DEV_LOGIN="1"` in `.env.local`, "Member sign in" signs you in as an officer without Discord. This only works outside production.

After any change to `prisma/schema.prisma`, run `npm run db:migrate -- --name <change>` and restart `npm run dev`.

## The addon

`addon/Guildhall` records two things:

- **Roster**: every member, online or not. It saves at most once every five minutes. If "show offline members" is off, it switches it on for a moment to read the full list and then puts it back.
- **Guild bank**: each tab, as you click on it. The game only knows a tab's contents once you have opened it.
- **Professions**: the levels of the character you are playing, at login, and the recipes of each profession window you open.

Officer notes are never recorded. `/gh status` shows what is saved and `/gh scan` saves the roster immediately.

Install it with `npm run addon:install`, or copy the `addon/Guildhall` folder into the game's `Interface/AddOns`. Set `WOW_FOREVER_DIR` in `.env.local` if the game is not in the default location.

The roster and bank capture have been confirmed working in the Forever client. The profession capture has only been run against the fake client in `tests/addon.test.lua`.

## Uploading

The game writes the addon's file on logout or `/reload`. Then either:

- **Sync script**, for whoever has this repository:
  - `npm run sync` uploads once.
  - `npm run sync:watch` stays running and uploads every time the game saves. With it running, `/gh sync` in game (which reloads the interface) is all it takes to update the site.
  - `npm run sync -- --dry` shows what would be sent.
  - It needs `SITE_URL` and `INGEST_TOKEN` in `.env.local`. The token must be one of the site's `INGEST_TOKENS`.
- **Upload page**, for any officer: sign in, open `/sync`, and choose `WTF/Account/<account>/SavedVariables/Guildhall.lua`.

Things to know:

- The first upload fixes which guild the site is for. An upload for any other guild (an alt's guild, say) is refused.
- An upload that is older than what the site already has is ignored, so two officers uploading in either order is safe.
- Members missing from a newer roster are removed from the site and reported as having left.

## Discord setup

1. Create an application at <https://discord.com/developers/applications>.
2. **OAuth2**: add the redirect `https://<your site>/auth/callback`. Copy the client ID and secret to `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.
3. **General Information**: copy the public key to `DISCORD_PUBLIC_KEY`, and set the Interactions Endpoint URL to `https://<your site>/api/discord/interactions`. Discord checks the URL when you save, so the site must already be deployed with the public key set.
4. **Bot**: copy the token to `DISCORD_BOT_TOKEN`. It is only used to register the commands.
5. Add the application to the server with the `applications.commands` scope, then run `npm run discord:register`.
6. Set `DISCORD_GUILD_ID` to the server's ID and `DISCORD_OFFICER_ROLE_IDS` to the officer role IDs. If the server has guests who should not see guild data, also set `DISCORD_MEMBER_ROLE_IDS`.
7. Optional: create a webhook on the updates channel and set `DISCORD_WEBHOOK_URL`.

Sign-in reads roles when a member signs in and keeps them for seven days. Someone who loses a role keeps access until then.

## Deploying to Fly.io

```bash
# Edit the app name in fly.toml first
fly launch --no-deploy --copy-config
fly volumes create guild_data --size 1 --region yyz
fly secrets set SESSION_SECRET=... PUBLIC_URL=https://<app>.fly.dev GUILD_NAME=... \
  DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... DISCORD_PUBLIC_KEY=... \
  DISCORD_GUILD_ID=... DISCORD_OFFICER_ROLE_IDS=... INGEST_TOKENS=yourname:<long random token>
fly deploy
```

The container applies database migrations each time it starts. The machine is kept running so slash commands answer within Discord's three-second limit.

Fly takes daily snapshots of the volume. That is the only backup, so check the retention setting on the volume. Everything in the database can also be rebuilt by uploading again.

## Making changes

`main` is what is live. Nothing is committed to it directly:

1. Branch from `main` and commit there.
2. Open a pull request. GitHub Actions checks formatting, lint, types, the addon test and the build.
3. Merge once the checks pass. The same workflow then deploys `main` to Fly.io and confirms the site answers.

Before pushing, the same checks run locally with `npm run check`, `npm run lint`, `npm run typecheck`, `npm run test:addon` and `npm run build`.

The deploy needs one repository secret, `FLY_API_TOKEN`: a deploy token for the app, made with `flyctl tokens create deploy`.

`npm run test:addon` runs the addon in a Lua interpreter against a fake game client (`tests/addon.test.lua`). It covers the roster and bank logic, not whether the real client has the functions the addon calls.

## Where things are

- `src/lib/snapshot.ts`: the shape of an upload, and the reader that turns the addon's file into one. Shared by the sync script, the upload page and the server.
- `src/lib/wow/luaTable.ts`: SavedVariables parser.
- `src/server/ingest.server.ts`: stores an upload and works out who joined, left and levelled.
- `src/server/discord.server.ts`: sign-in, slash command signature check, channel posts.
- `src/server/commands.server.ts` and `src/lib/commands.ts`: slash command answers and definitions.
- `src/server/guild.functions.ts`: what the pages read and change, including character claims.
- `src/lib/crafting.ts` and `src/server/crafting.server.ts`: the shape of a professions upload, matching it to the recipe list, and storing it.
- `src/server/requests.functions.ts`: crafting requests and their channel posts.
- `src/server/session.server.ts`: the signed sign-in cookie. There is no session table.
- `src/routes`: file-based routes. `src/routeTree.gen.ts` is generated: don't edit it.

## Licence

Guildhall is free software under the GNU General Public License, version 3 or later; see `LICENSE`. The recipe list in `src/data/recipes.json` is derived from the OneForAll addon by Smoergi, which is under the same licence.

The icons in `public/icons` and the item text in `src/data/icons.json` are taken from the World of Warcraft game client. They belong to Blizzard Entertainment and are not covered by the licence above.
