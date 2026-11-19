/** Everything the server reads from the environment, in one place. */

const env = (name: string): string => process.env[name]?.trim() ?? ''

const csv = (name: string): Array<string> =>
  env(name)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export const config = {
  /** Shown in the header and on the landing page. */
  get guildName() {
    return env('GUILD_NAME') || 'Guildhall'
  },
  get tagline() {
    return env('GUILD_TAGLINE')
  },
  /** Where "Request to join" sends visitors. */
  get inviteUrl() {
    return env('DISCORD_INVITE_URL')
  },
  /** The site's own address, used to build the Discord redirect. */
  get publicUrl() {
    return (env('PUBLIC_URL') || 'http://localhost:3000').replace(/\/$/, '')
  },
  get sessionSecret() {
    const secret = env('SESSION_SECRET')
    if (secret.length < 32)
      throw new Error('SESSION_SECRET must be set to at least 32 characters')
    return secret
  },
  discord: {
    get clientId() {
      return env('DISCORD_CLIENT_ID')
    },
    get clientSecret() {
      return env('DISCORD_CLIENT_SECRET')
    },
    /** The Discord server whose members may sign in. */
    get guildId() {
      return env('DISCORD_GUILD_ID')
    },
    /** If set, signing in also needs one of these roles. */
    get memberRoleIds() {
      return csv('DISCORD_MEMBER_ROLE_IDS')
    },
    get officerRoleIds() {
      return csv('DISCORD_OFFICER_ROLE_IDS')
    },
    /** Verifies that slash commands really come from Discord. */
    get publicKey() {
      return env('DISCORD_PUBLIC_KEY')
    },
    /** Channel webhook for guild updates; nothing is posted without it. */
    get webhookUrl() {
      return env('DISCORD_WEBHOOK_URL')
    },
  },
  /** "name:token" pairs, one per person who uploads with the sync script. */
  get ingestTokens(): Array<{ name: string; token: string }> {
    return csv('INGEST_TOKENS').flatMap((pair) => {
      const at = pair.indexOf(':')
      const name = pair.slice(0, at)
      const token = pair.slice(at + 1)
      return at > 0 && token.length >= 24 ? [{ name, token }] : []
    })
  },
  /** Local development only: sign in as an officer without Discord. */
  get devLogin() {
    return process.env.NODE_ENV !== 'production' && env('DEV_LOGIN') === '1'
  },
}
