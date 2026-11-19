<p align="center"><img src="public/logo.svg" alt="Guildhall logo" width="120" /></p>

# Guildhall

A website and Discord bot for a WoW Forever guild. An in-game addon records the guild roster and guild bank; an upload sends them to the site; members sign in with Discord to browse them, or ask the bot from Discord.

Stack: TanStack Start (React 19, Vite), Tailwind CSS v4, Prisma 7 with SQLite. It runs as one small machine on Fly.io with the database on a volume.

The guild's name, tagline and Discord server all come from environment variables, so nothing in the repository is specific to one guild.

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
| `/bank`              | Members         | Guild bank by tab, with search, and the bank's gold                                   |
| `/sync`              | Officers        | Upload the addon's saved file from the browser; recent upload history                 |
| `/roster` in Discord | Server members  | Roster summary                                                                        |
| `/who <name>`        | Server members  | Look up a character                                                                   |
| `/bank [item]`       | Server members  | Search the bank, or list its tabs                                                     |
| Channel posts        | Updates channel | Who joined, who left, and who passed a multiple of 10 levels, after each upload       |

Slash command replies are only visible to the person who asked. Change `EPHEMERAL` in `src/routes/api/discord/interactions.ts` to make them public.

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

Officer notes are never recorded. `/gh status` shows what is saved and `/gh scan` saves the roster immediately.

Install it with `npm run addon:install`, or copy the `addon/Guildhall` folder into the game's `Interface/AddOns`. Set `WOW_FOREVER_DIR` in `.env.local` if the game is not in the default location.

The addon has been run against a mock of the game's functions, not yet inside the Forever client. The first in-game session should confirm that the roster and bank functions it calls exist there.

## Uploading

The game writes the addon's file on logout or `/reload`. Then either:

- **Sync script**, for whoever has this repository:
  - `npm run sync` uploads once.
  - `npm run sync -- --watch` stays running and uploads every time the game saves.
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

## Where things are

- `src/lib/snapshot.ts`: the shape of an upload, and the reader that turns the addon's file into one. Shared by the sync script, the upload page and the server.
- `src/lib/wow/luaTable.ts`: SavedVariables parser.
- `src/server/ingest.server.ts`: stores an upload and works out who joined, left and levelled.
- `src/server/discord.server.ts`: sign-in, slash command signature check, channel posts.
- `src/server/commands.server.ts` and `src/lib/commands.ts`: slash command answers and definitions.
- `src/server/session.server.ts`: the signed sign-in cookie. There is no session table.
- `src/routes`: file-based routes. `src/routeTree.gen.ts` is generated: don't edit it.
