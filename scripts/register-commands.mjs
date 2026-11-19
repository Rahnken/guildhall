// Tells Discord which slash commands the guild's server has.
// Run with: npm run discord:register   (again after changing src/lib/commands.ts)
//
// Needs DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN and DISCORD_GUILD_ID in
// .env.local, and the application added to the server with the
// applications.commands scope.
import { COMMANDS } from '../src/lib/commands.ts'

const { DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID } = process.env
if (!DISCORD_CLIENT_ID || !DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  console.error(
    'Set DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN and DISCORD_GUILD_ID in .env.local.',
  )
  process.exit(1)
}

// Registered on the one server rather than globally: only its members can
// use them, and changes show up immediately.
const response = await fetch(
  `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/guilds/${DISCORD_GUILD_ID}/commands`,
  {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
    body: JSON.stringify(COMMANDS),
  },
)
if (!response.ok) {
  console.error(
    `Discord refused (${response.status}): ${await response.text()}`,
  )
  process.exit(1)
}
console.log(
  `Registered: ${COMMANDS.map((command) => `/${command.name}`).join(', ')}`,
)
