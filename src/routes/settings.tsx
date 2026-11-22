import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { Button, Card, ErrorText, Input, useAction } from '../components/ui'
import { themeCss } from '../lib/theme'
import { saveSettings } from '../server/guild.functions'

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ context }) => {
    if (!context.site.viewer?.officer) throw redirect({ to: '/' })
  },
  component: Settings,
})

const label = 'mb-1 block text-sm font-medium text-stone-300'
const hint = 'mt-1 text-xs text-stone-500'

/** The three parts of a tabard and what each one colours on the site. */
const TABARD = [
  { key: 'background', part: 'Background', used: 'Page and panels' },
  { key: 'emblem', part: 'Emblem', used: 'Buttons and selection' },
  { key: 'border', part: 'Border', used: 'Links' },
] as const

/** The site's own colours, shown in the pickers until one is chosen. */
const DEFAULTS = { background: '#1c1917', emblem: '#f59e0b', border: '#7dd3fc' }

function Settings() {
  const { site } = Route.useRouteContext()
  const router = useRouter()
  const { busy, error, run } = useAction()
  const [name, setName] = useState(site.name)
  const [description, setDescription] = useState(site.description)
  const [inviteUrl, setInviteUrl] = useState(site.inviteUrl)
  const [colors, setColors] = useState(site.colors)
  const [saved, setSaved] = useState(false)

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setSaved(false)
    }

  const save = () =>
    run(async () => {
      await saveSettings({ data: { name, description, inviteUrl, colors } })
      // The header and the public page read these on every navigation.
      await router.invalidate()
      setSaved(true)
    })

  return (
    <Card title="Public page and colours" className="max-w-2xl">
      {/* Shows unsaved colour picks straight away; saving makes them stick. */}
      <style dangerouslySetInnerHTML={{ __html: themeCss(colors) }} />
      <p className="mb-4 text-sm text-stone-400">
        Anyone can see these without signing in.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div>
          <label htmlFor="name" className={label}>
            Guild name
          </label>
          <Input
            id="name"
            value={name}
            maxLength={60}
            onChange={(e) => edit(setName)(e.target.value)}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="description" className={label}>
            Description
          </label>
          <textarea
            id="description"
            value={description}
            maxLength={2000}
            rows={7}
            onChange={(e) => edit(setDescription)(e.target.value)}
            className="w-full rounded border border-stone-700 bg-stone-900 px-2 py-1.5 text-sm text-stone-100 focus:border-sky-500 focus:outline-none"
          />
          <p className={hint}>Line breaks are kept.</p>
        </div>
        <div>
          <label htmlFor="invite" className={label}>
            Discord invite link
          </label>
          <Input
            id="invite"
            value={inviteUrl}
            placeholder="https://discord.gg/…"
            onChange={(e) => edit(setInviteUrl)(e.target.value)}
            className="w-full"
          />
          <p className={hint}>
            “Request to join” goes here. Leave it empty to hide the button.
          </p>
        </div>
        <fieldset>
          <legend className={label}>Colours, from the guild tabard</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {TABARD.map(({ key, part, used }) => (
              <div key={key} className="text-sm">
                <label className="flex items-center gap-2 text-stone-200">
                  <input
                    type="color"
                    // The picker needs some colour; this is the site's own.
                    value={colors[key] || DEFAULTS[key]}
                    onChange={(e) =>
                      edit(setColors)({ ...colors, [key]: e.target.value })
                    }
                    className="size-8 cursor-pointer rounded border border-stone-700 bg-transparent"
                  />
                  {part}
                </label>
                <p className={hint}>
                  {used}
                  {colors[key] && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="text-sky-300 hover:underline"
                        onClick={() =>
                          edit(setColors)({ ...colors, [key]: '' })
                        }
                      >
                        use the site’s own
                      </button>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
          <p className={hint}>
            In game, <code className="text-sky-300">/gh status</code> prints
            your tabard’s three colours to copy here. Brightness is adjusted so
            text stays readable; the page shows your picks before you save.
          </p>
        </fieldset>
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={busy}
            className="!bg-sky-500 !text-(--on-sky) hover:!bg-sky-400"
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {saved && <span className="text-sm text-emerald-300">Saved.</span>}
        </div>
        <ErrorText error={error} />
      </form>
    </Card>
  )
}
