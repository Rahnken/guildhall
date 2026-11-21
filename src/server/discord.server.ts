/** Calls to Discord: sign-in, slash command verification, channel posts. */
import { createPublicKey, verify } from 'node:crypto'

import { config } from './config.server'
import type { Viewer } from './session.server'

const API = 'https://discord.com/api/v10'

export const redirectUri = () => `${config.publicUrl}/auth/callback`

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    // identify: who they are. guilds.members.read: their roles in our server.
    scope: 'identify guilds.members.read',
    state,
    prompt: 'none',
  })
  return `https://discord.com/oauth2/authorize?${params}`
}

export type SignInResult =
  { ok: true; viewer: Viewer } | { ok: false; reason: 'not-member' | 'failed' }

/** Trades the code from Discord for the person's identity and roles. */
export async function signIn(code: string): Promise<SignInResult> {
  const tokenResponse = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
    }),
  })
  if (!tokenResponse.ok) return { ok: false, reason: 'failed' }
  const { access_token: token } = (await tokenResponse.json()) as {
    access_token: string
  }

  const memberResponse = await fetch(
    `${API}/users/@me/guilds/${config.discord.guildId}/member`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  // Discord answers 404 when the person is not in the server.
  if (memberResponse.status === 404) return { ok: false, reason: 'not-member' }
  if (!memberResponse.ok) return { ok: false, reason: 'failed' }
  const member = (await memberResponse.json()) as {
    nick: string | null
    roles: Array<string>
    user: { id: string; username: string; global_name: string | null }
  }

  const { memberRoleIds, officerRoleIds } = config.discord
  const officer = member.roles.some((role) => officerRoleIds.includes(role))
  if (
    memberRoleIds.length > 0 &&
    !officer &&
    !member.roles.some((role) => memberRoleIds.includes(role))
  )
    return { ok: false, reason: 'not-member' }

  return {
    ok: true,
    viewer: {
      id: member.user.id,
      name: member.nick ?? member.user.global_name ?? member.user.username,
      officer,
    },
  }
}

// Wraps a raw 32-byte Ed25519 key so Node can load it.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/** True when the request body was signed by Discord for our application. */
export function isFromDiscord(
  body: string,
  signature: string | null,
  timestamp: string | null,
): boolean {
  if (!signature || !timestamp || !config.discord.publicKey) return false
  try {
    const key = createPublicKey({
      key: Buffer.concat([
        ED25519_SPKI_PREFIX,
        Buffer.from(config.discord.publicKey, 'hex'),
      ]),
      format: 'der',
      type: 'spki',
    })
    return verify(
      null,
      Buffer.from(timestamp + body),
      key,
      Buffer.from(signature, 'hex'),
    )
  } catch {
    return false
  }
}

/** Posts to the updates channel. Does nothing when no webhook is set. */
export async function postToChannel(
  content: string,
  /** Discord user ids that a <@id> in the text is allowed to notify. */
  notify: Array<string> = [],
): Promise<void> {
  const url = config.discord.webhookUrl
  if (!url) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No pings beyond the people named, whatever a character name or
      // note happens to contain.
      body: JSON.stringify({
        content: content.slice(0, 1900),
        allowed_mentions: { parse: [], users: notify },
      }),
    })
  } catch (error) {
    console.error('Discord webhook failed', error)
  }
}
