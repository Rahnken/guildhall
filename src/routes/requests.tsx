import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'

import { Button, Card, ErrorText, cx, useAction } from '../components/ui'
import { when } from '../lib/format'
import {
  acceptRequest,
  cancelRequest,
  completeRequest,
  getRequests,
  releaseRequest,
} from '../server/requests.functions'

export const Route = createFileRoute('/requests')({
  beforeLoad: ({ context }) => {
    if (!context.site.viewer) throw redirect({ to: '/' })
  },
  loader: () => getRequests(),
  component: Requests,
})

type Request = Awaited<ReturnType<typeof getRequests>>['active'][number]

function Requests() {
  const { active, finished, officer } = Route.useLoaderData()
  const [onlyMine, setOnlyMine] = useState(false)
  const shown = active.filter(
    (r) => !onlyMine || r.canMake || r.mine || r.askedMe || r.makingIt,
  )

  return (
    <div className="space-y-4">
      <Card
        title="Crafting requests"
        actions={
          <label className="flex items-center gap-1.5 text-xs text-stone-300">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
            />
            Only mine and ones I can make
          </label>
        }
      >
        <p className="mb-3 text-sm text-stone-400">
          Need something made? Find it on the{' '}
          <Link to="/crafting" className="text-sky-300 hover:underline">
            Crafting
          </Link>{' '}
          page and press “Request this”.
        </p>
        {shown.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">
            {active.length === 0
              ? 'Nothing is waiting to be made.'
              : 'Nothing here is yours or something you can make.'}
          </p>
        ) : (
          <ul className="divide-y divide-stone-800/60">
            {shown.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                officer={officer}
              />
            ))}
          </ul>
        )}
      </Card>
      {finished.length > 0 && (
        <Card title="Recently finished">
          <ul className="divide-y divide-stone-800/60">
            {finished.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                officer={officer}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

const STATUS: Record<string, { label: string; className: string } | undefined> =
  {
    open: { label: 'Open', className: 'bg-amber-500/15 text-amber-300' },
    accepted: { label: 'Being made', className: 'bg-sky-500/15 text-sky-300' },
    done: { label: 'Done', className: 'bg-emerald-500/15 text-emerald-300' },
    cancelled: { label: 'Cancelled', className: 'bg-stone-800 text-stone-400' },
  }

function RequestRow({
  request,
  officer,
}: {
  request: Request
  officer: boolean
}) {
  const router = useRouter()
  const { busy, error, run } = useAction()
  const act = (fn: (input: { data: { id: number } }) => Promise<unknown>) =>
    run(async () => {
      await fn({ data: { id: request.id } })
      await router.invalidate()
    })
  const status = STATUS[request.status] ?? {
    label: request.status,
    className: 'bg-stone-800 text-stone-400',
  }
  const active = request.status === 'open' || request.status === 'accepted'

  return (
    <li className={cx('py-3 text-sm', !active && 'opacity-70')}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {request.icon ? (
          <img
            src={`/icons/${request.icon}.webp`}
            alt=""
            width={36}
            height={36}
            loading="lazy"
            className="shrink-0 rounded border border-stone-700 bg-stone-900"
          />
        ) : (
          <span className="h-9 w-9 shrink-0 rounded border border-stone-700 bg-stone-900" />
        )}
        <div className="min-w-0 flex-1 basis-64">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <Link
              to="/crafting"
              search={{ p: request.profession, r: request.spellId }}
              className="font-medium text-stone-100 hover:underline"
            >
              {request.quantity > 1 && `${request.quantity}× `}
              {request.name}
            </Link>
            <span className="text-xs text-stone-500">{request.profession}</span>
            <span className={cx('rounded px-1.5 text-xs', status.className)}>
              {status.label}
            </span>
            {request.askedMe && request.status === 'open' && (
              <span className="rounded bg-amber-500 px-1.5 text-xs font-medium text-(--on-amber)">
                Asked you
              </span>
            )}
          </p>
          <p className="mt-0.5 text-stone-300">
            For <span className="text-stone-100">{request.requester}</span>
            {request.deliverTo && <> · send to {request.deliverTo}</>}
            {request.crafter && (
              <>
                {' '}
                · {request.status === 'done' ? 'made by' : 'being made by'}{' '}
                <span className="text-stone-100">{request.crafter}</span>
              </>
            )}
            {!request.crafter && request.asked && <> · asked {request.asked}</>}
            <span className="text-stone-500"> · {when(request.createdAt)}</span>
          </p>
          <p className="mt-0.5 text-xs text-stone-400">
            {request.hasMaterials
              ? 'They will send the materials: '
              : 'Materials needed too: '}
            {request.materials.map((m) => `${m.count}× ${m.name}`).join(', ') ||
              'none listed'}
          </p>
          {request.note && (
            <p className="mt-1 text-stone-300">“{request.note}”</p>
          )}
        </div>
        {active && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {request.status === 'open' && !request.mine && (
              <Button disabled={busy} onClick={() => act(acceptRequest)}>
                I’ll make it
              </Button>
            )}
            {request.status === 'accepted' &&
              (request.makingIt || request.mine || officer) && (
                <Button disabled={busy} onClick={() => act(completeRequest)}>
                  {request.mine ? 'I got it' : 'Done'}
                </Button>
              )}
            {request.status === 'accepted' && request.makingIt && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => act(releaseRequest)}
              >
                Can’t make it
              </Button>
            )}
            {(request.mine || officer) && (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => act(cancelRequest)}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>
      <ErrorText error={error} />
    </li>
  )
}
