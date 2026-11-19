import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { Button, Card, ErrorText, Input, useAction } from '../components/ui'
import { saveSettings } from '../server/guild.functions'

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ context }) => {
    if (!context.site.viewer?.officer) throw redirect({ to: '/' })
  },
  component: Settings,
})

const label = 'mb-1 block text-sm font-medium text-stone-300'
const hint = 'mt-1 text-xs text-stone-500'

function Settings() {
  const { site } = Route.useRouteContext()
  const router = useRouter()
  const { busy, error, run } = useAction()
  const [name, setName] = useState(site.name)
  const [description, setDescription] = useState(site.description)
  const [inviteUrl, setInviteUrl] = useState(site.inviteUrl)
  const [saved, setSaved] = useState(false)

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setSaved(false)
    }

  const save = () =>
    run(async () => {
      await saveSettings({ data: { name, description, inviteUrl } })
      // The header and the public page read these on every navigation.
      await router.invalidate()
      setSaved(true)
    })

  return (
    <Card title="Public page" className="max-w-2xl">
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
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={busy}
            className="!bg-sky-500 hover:!bg-sky-400"
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
