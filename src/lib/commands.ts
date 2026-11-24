/**
 * Discord slash command definitions: what `npm run discord:register` sends to
 * Discord. src/server/commands.server.ts answers them.
 */
const STRING = 3

export const COMMANDS = [
  {
    name: 'roster',
    description: 'Guild roster summary: members, classes and highest levels',
  },
  {
    name: 'who',
    description: 'Look up a guild member’s character',
    options: [
      {
        type: STRING,
        name: 'name',
        description: 'Character name, or part of it',
        required: true,
      },
    ],
  },
  {
    name: 'bank',
    description: 'Search the guild bank, or list its tabs',
    options: [
      {
        type: STRING,
        name: 'item',
        description: 'Item name, or part of it',
        required: false,
      },
    ],
  },
  {
    name: 'events',
    description: 'What the guild has planned, and who is coming',
  },
]
