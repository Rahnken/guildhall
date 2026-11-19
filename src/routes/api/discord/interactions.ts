import { createFileRoute } from '@tanstack/react-router'

import { runCommand } from '#/server/commands.server'
import { config } from '#/server/config.server'
import { isFromDiscord } from '#/server/discord.server'

const PING = 1
const COMMAND = 2
const PONG = 1
const MESSAGE = 4
/** Only the person who ran the command sees the reply. */
const EPHEMERAL = 64

const reply = (content: string) =>
  Response.json({
    type: MESSAGE,
    data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } },
  })

/** Discord posts every slash command here (the app's Interactions Endpoint URL). */
export const Route = createFileRoute('/api/discord/interactions')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text()
        if (
          !isFromDiscord(
            body,
            request.headers.get('x-signature-ed25519'),
            request.headers.get('x-signature-timestamp'),
          )
        )
          return new Response('Bad signature', { status: 401 })

        const interaction = JSON.parse(body)
        if (interaction.type === PING) return Response.json({ type: PONG })
        if (interaction.type !== COMMAND) return reply('I can’t do that yet.')
        if (interaction.guild_id !== config.discord.guildId)
          return reply('These commands only work in the guild’s server.')
        try {
          return reply(await runCommand(interaction))
        } catch (error) {
          console.error('Slash command failed', error)
          return reply('Something went wrong looking that up.')
        }
      },
    },
  },
})
