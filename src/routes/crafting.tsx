import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Card,
  ErrorText,
  Input,
  Select,
  Table,
  cx,
  useAction,
} from '../components/ui'
import { craftingFromSavedVariables } from '../lib/crafting'
import { classColor, when } from '../lib/format'
import {
  getCrafters,
  getMyRecipes,
  getRecipe,
  getRecipeBook,
  uploadCrafting,
} from '../server/crafting.functions'
import { createRequest, getMyCharacters } from '../server/requests.functions'

type Search = { p?: string; r?: number }

export const Route = createFileRoute('/crafting')({
  // ?p= is the profession being browsed and ?r= the recipe open beside the
  // list, so a recipe can be linked to.
  validateSearch: (search: Record<string, unknown>): Search => ({
    p: typeof search.p === 'string' ? search.p : undefined,
    r: Number.isInteger(Number(search.r)) ? Number(search.r) : undefined,
  }),
  beforeLoad: ({ context }) => {
    if (!context.site.viewer) throw redirect({ to: '/' })
  },
  // Opening a recipe must not fetch the whole list again.
  loaderDeps: ({ search }) => ({ p: search.p }),
  loader: async ({ deps }) => {
    const [book, crafters, mine, characters] = await Promise.all([
      getRecipeBook({ data: { profession: deps.p ?? '' } }),
      getCrafters(),
      getMyRecipes(),
      getMyCharacters(),
    ])
    return { book, crafters, mine, characters }
  },
  component: Crafting,
})

const ALL = 'All'
const GATHERING = ['Fishing', 'Herbalism', 'Mining', 'Skinning']
/** More rows than this and the list asks for a search instead. */
const MAX_ROWS = 300

type Book = Awaited<ReturnType<typeof getRecipeBook>>
type Detail = NonNullable<Awaited<ReturnType<typeof getRecipe>>>
type Crafters = Awaited<ReturnType<typeof getCrafters>>

/** Name colours by item quality, poor to legendary, as in game. */
const QUALITY = [
  '#9d9d9d',
  '#ffffff',
  '#1eff00',
  '#0070dd',
  '#a335ee',
  '#ff8000',
]

const wowhead = (kind: 'item' | 'spell', id: number) =>
  `https://www.wowhead.com/forever/${kind}=${id}`

/** A game icon from /public/icons, or an empty frame when there is none. */
function Icon({ icon, size }: { icon: number | null; size: number }) {
  const frame = 'shrink-0 rounded border border-stone-700 bg-stone-900'
  return icon ? (
    <img
      src={`/icons/${icon}.webp`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={frame}
    />
  ) : (
    <span className={frame} style={{ width: size, height: size }} />
  )
}

function Crafter(props: {
  character: string
  classToken: string
  player: string | null
}) {
  return (
    <>
      <span
        className="font-medium"
        style={{ color: classColor(props.classToken) }}
      >
        {props.character}
      </span>
      {props.player && (
        <span className="ml-1.5 text-xs text-stone-500">{props.player}</span>
      )}
    </>
  )
}

function Crafting() {
  const { book, crafters, mine, characters } = Route.useLoaderData()
  const { r: open } = Route.useSearch()
  const navigate = Route.useNavigate()
  const show = (next: Search) =>
    navigate({ search: next, replace: true, resetScroll: false })

  const have = crafters.find((c) => c.name === book.profession)?.crafters ?? []
  const gathering = crafters.filter(
    (c) => !book.professions.some((p) => p.name === c.name),
  )

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-stone-800 bg-stone-950/60 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)]">
        <Professions
          book={book}
          onPick={(name) => show({ p: name, r: undefined })}
        />
        <RecipeList
          // A new profession starts with an empty search box.
          key={book.profession}
          book={book}
          have={have}
          open={open}
          onOpen={(spellId) => show({ p: book.profession, r: spellId })}
        />
        <RecipeDetail
          open={open}
          characters={characters}
          onClose={() => show({ p: book.profession, r: undefined })}
        />
      </section>
      {gathering.length > 0 && <Gathering professions={gathering} />}
      <Mine mine={mine} />
    </div>
  )
}

function Professions(props: { book: Book; onPick: (name: string) => void }) {
  const { book } = props
  const entries = [
    ...book.professions,
    {
      name: ALL,
      recipes: book.professions.reduce((n, p) => n + p.recipes, 0),
      known: book.professions.reduce((n, p) => n + p.known, 0),
    },
  ]
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-stone-800 p-2 lg:block lg:space-y-0.5 lg:border-b-0 lg:border-r lg:p-3">
      <h2 className="mb-2 hidden text-sm font-semibold uppercase tracking-wide text-stone-400 lg:block">
        Professions
      </h2>
      {entries.map((p) => (
        <button
          key={p.name}
          type="button"
          onClick={() => props.onPick(p.name)}
          aria-current={p.name === book.profession}
          className={cx(
            'flex shrink-0 items-baseline justify-between gap-3 rounded px-2.5 py-1.5 text-left text-sm lg:w-full',
            p.name === book.profession
              ? 'bg-amber-500/15 text-amber-300'
              : 'text-stone-300 hover:bg-stone-800/70',
          )}
        >
          <span>{p.name === ALL ? 'All professions' : p.name}</span>
          <span
            className="text-xs text-stone-500"
            title={`The guild knows ${p.known} of ${p.recipes} recipes`}
          >
            {p.known}/{p.recipes}
          </span>
        </button>
      ))}
    </nav>
  )
}

function RecipeList(props: {
  book: Book
  have: Crafters[number]['crafters']
  open: number | undefined
  onOpen: (spellId: number) => void
}) {
  const { book, open } = props
  const [query, setQuery] = useState('')
  const [knownOnly, setKnownOnly] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return book.recipes.filter(
      (r) =>
        (!knownOnly || r.knownBy > 0) &&
        (!q || r.name.toLowerCase().includes(q) || r.materials.includes(q)),
    )
  }, [book.recipes, query, knownOnly])
  const known = book.recipes.filter((r) => r.knownBy > 0).length

  return (
    <div
      className={cx(
        'min-w-0 border-stone-800 p-3 lg:border-r',
        // On a phone the open recipe takes the list's place.
        open !== undefined && 'hidden lg:block',
      )}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-base font-semibold text-stone-100">
          {book.profession === ALL ? 'All professions' : book.profession}
        </h2>
        <p className="text-xs text-stone-500">
          {book.recipes.length} recipes, {known} known in the guild
        </p>
      </div>
      {props.have.length > 0 && (
        <p className="mb-2 text-xs leading-relaxed text-stone-400">
          {props.have.map((c, i) => (
            <span key={c.character}>
              {i > 0 && <span className="text-stone-600"> · </span>}
              <span style={{ color: classColor(c.classToken) }}>
                {c.character}
              </span>{' '}
              {c.skill}
            </span>
          ))}
        </p>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Input
          placeholder="Search name or material…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1"
        />
        <label className="flex items-center gap-1.5 text-xs text-stone-300">
          <input
            type="checkbox"
            checked={knownOnly}
            onChange={(e) => setKnownOnly(e.target.checked)}
          />
          Someone knows it
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500">
          No recipe matches.
        </p>
      ) : (
        <ul className="lg:max-h-[34rem] lg:overflow-y-auto lg:pr-1 [scrollbar-color:var(--color-stone-600)_transparent]">
          {rows.slice(0, MAX_ROWS).map((r) => (
            <li key={r.spellId}>
              <button
                type="button"
                onClick={() => props.onOpen(r.spellId)}
                aria-current={r.spellId === open}
                className={cx(
                  'flex w-full items-center gap-2 rounded border px-2.5 py-1.5 text-left text-sm',
                  r.spellId === open
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
                    : 'border-transparent hover:bg-stone-800/70',
                  r.spellId !== open &&
                    (r.knownBy > 0 ? 'text-stone-200' : 'text-stone-500'),
                )}
              >
                <Icon icon={r.icon} size={22} />
                <span className="min-w-0 flex-1 truncate">
                  {r.name}
                  {book.profession === ALL && (
                    <span className="ml-2 text-xs text-stone-500">
                      {r.profession}
                    </span>
                  )}
                </span>
                {r.mine && (
                  <span
                    className="text-emerald-400"
                    title="One of your characters knows it"
                  >
                    ✓
                  </span>
                )}
                {r.knownBy > 0 && (
                  <span
                    className="rounded bg-stone-800 px-1.5 text-xs text-amber-300"
                    title={`${r.knownBy} guild character${r.knownBy === 1 ? '' : 's'} can make it`}
                  >
                    {r.knownBy}
                  </span>
                )}
                <span
                  className="w-8 text-right text-xs tabular-nums text-stone-500"
                  title="Skill needed to learn it"
                >
                  {r.skill ?? ''}
                </span>
              </button>
            </li>
          ))}
          {rows.length > MAX_ROWS && (
            <li className="px-2.5 py-2 text-xs text-stone-500">
              Showing the first {MAX_ROWS} of {rows.length}. Search to narrow it
              down.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function RecipeDetail(props: {
  open: number | undefined
  /** The viewer's own characters, to send a request to. */
  characters: Array<string>
  onClose: () => void
}) {
  const { open } = props
  const [detail, setDetail] = useState<Detail | null>(null)
  const [missing, setMissing] = useState(false)

  // The last recipe stays on screen until the next one arrives; an answer
  // for a recipe that is no longer the open one is dropped.
  useEffect(() => {
    setMissing(false)
    if (open === undefined) {
      setDetail(null)
      return
    }
    let current = true
    getRecipe({ data: { spellId: open } })
      .then((result) => {
        if (!current) return
        setDetail(result)
        setMissing(!result)
      })
      .catch(() => current && setMissing(true))
    return () => {
      current = false
    }
  }, [open])

  if (open === undefined)
    return (
      <div className="hidden p-6 text-sm text-stone-500 lg:block">
        Pick a recipe to see what it takes and who can make it.
      </div>
    )
  if (missing)
    return (
      <div className="p-4 text-sm text-stone-400">
        <BackToList onClose={props.onClose} />
        That recipe could not be loaded.
      </div>
    )
  if (!detail) return <div className="p-4 text-sm text-stone-500">Loading…</div>

  const made = detail.itemId
    ? wowhead('item', detail.itemId)
    : wowhead('spell', detail.spellId)
  return (
    <div className={cx('min-w-0 p-4', detail.spellId !== open && 'opacity-60')}>
      <BackToList onClose={props.onClose} />
      <h2
        className="flex items-center gap-2.5 text-lg font-semibold text-stone-100"
        style={{ color: QUALITY[detail.quality ?? -1] }}
      >
        <Icon icon={detail.icon} size={36} />
        {detail.name}
        {detail.makes ? (
          <span className="ml-1.5 text-sm font-normal text-stone-400">
            ×{detail.makes}
          </span>
        ) : null}
      </h2>
      <p className="mt-0.5 text-xs text-stone-400">
        {detail.profession}
        {detail.skill ? ` ${detail.skill}` : ''} · {detail.category}
        {detail.side === 'A' && ' · Alliance only'}
        {detail.side === 'H' && ' · Horde only'}
      </p>
      <p className="mt-1 text-xs">
        <a
          href={made}
          target="_blank"
          rel="noreferrer"
          className="text-sky-300 hover:underline"
        >
          View on Wowhead
        </a>
        {detail.start && (
          <span className="text-stone-500">
            {' '}
            · Known when you learn {detail.profession}
          </span>
        )}
        {detail.recipeItemId && (
          <span className="text-stone-500">
            {' '}
            · Taught by{' '}
            <a
              href={wowhead('item', detail.recipeItemId)}
              target="_blank"
              rel="noreferrer"
              className="text-sky-300 hover:underline"
            >
              a recipe item
            </a>
          </span>
        )}
      </p>

      {detail.tooltip.length > 0 && <Tooltip lines={detail.tooltip} />}

      <MaterialsAndRequest
        // A different recipe starts with a closed, empty form.
        key={detail.spellId}
        detail={detail}
        characters={props.characters}
      />

      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-stone-400">
        Who can make it
      </h3>
      {detail.crafters.length === 0 ? (
        <p className="text-sm text-stone-500">
          Nobody in the guild has this saved yet.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {detail.crafters.map((c) => (
            <li key={c.character} className="flex justify-between gap-3">
              <span>
                <Crafter {...c} />
                {c.mine && (
                  <span className="ml-1.5 text-xs text-emerald-400">you</span>
                )}
              </span>
              <span className="text-xs text-stone-500">
                {detail.profession} {c.skill}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The materials, and the request form whose "How many" multiplies them. A
 * material that is itself crafted shows what it is made from underneath.
 */
function MaterialsAndRequest(props: {
  detail: Detail
  characters: Array<string>
}) {
  const { detail } = props
  const navigate = Route.useNavigate()
  const [times, setTimes] = useState(1)
  return (
    <>
      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-stone-400">
        Materials{times > 1 && ` for ${times}`}
      </h3>
      {detail.reagents.length === 0 ? (
        <p className="text-sm text-stone-500">None listed.</p>
      ) : (
        <ul className="divide-y divide-stone-800/60 rounded border border-stone-800 text-sm">
          {detail.reagents.map((reagent) => {
            const need = reagent.count * times
            const from = reagent.from
            // Whole crafts of the material, each using its own materials.
            const crafts = from ? Math.ceil(need / from.makes) : 0
            return (
              <li key={reagent.itemId} className="px-2.5 py-1.5">
                <Material
                  {...reagent}
                  need={need}
                  href={wowhead('item', reagent.itemId)}
                />
                {from && (
                  <div className="ml-3 mt-1 border-l border-stone-800 pl-3">
                    <button
                      type="button"
                      className="mb-0.5 text-xs text-sky-300 hover:underline"
                      onClick={() =>
                        navigate({
                          search: { p: from.profession, r: from.spellId },
                          replace: true,
                          resetScroll: false,
                        })
                      }
                    >
                      or made with {from.profession} from
                    </button>
                    {from.reagents.map((raw) => (
                      <Material
                        key={raw.itemId}
                        {...raw}
                        need={raw.count * crafts}
                        href={wowhead('item', raw.itemId)}
                        small
                      />
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <RequestForm {...props} onQuantity={setTimes} />
    </>
  )
}

/** One line of a materials list: icon, how many, name, and the bank's stock. */
function Material(props: {
  name: string
  icon: number | null
  need: number
  inBank: number
  href: string
  small?: boolean
}) {
  return (
    <div
      className={cx(
        'flex items-baseline justify-between gap-3',
        props.small && 'py-0.5 text-xs',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon icon={props.icon} size={props.small ? 16 : 22} />
        <span className="tabular-nums text-stone-400">{props.need}×</span>
        <a
          href={props.href}
          target="_blank"
          rel="noreferrer"
          className={cx(
            'hover:underline',
            props.small ? 'text-stone-300' : 'text-stone-200',
          )}
        >
          {props.name}
        </a>
      </span>
      <span
        className={cx(
          'shrink-0 text-xs',
          props.inBank >= props.need ? 'text-emerald-400' : 'text-stone-500',
        )}
      >
        {props.inBank} in bank
      </span>
    </div>
  )
}

/** "Request this": asks the guild's crafters to make the open recipe. */
function RequestForm(props: {
  detail: Detail
  characters: Array<string>
  /** Told how many are wanted, so the materials above can show totals. */
  onQuantity: (quantity: number) => void
}) {
  const { detail, characters } = props
  const navigate = Route.useNavigate()
  const { busy, error, run } = useAction()
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState('1')
  const [deliverTo, setDeliverTo] = useState(characters[0] ?? '')
  const [hasMaterials, setHasMaterials] = useState(false)
  const [ask, setAsk] = useState('')
  const [note, setNote] = useState('')
  // Only crafters with a known player can be asked by name.
  const askable = detail.crafters.filter((c) => c.player && !c.mine)

  if (!open)
    return (
      <Button className="mt-4" onClick={() => setOpen(true)}>
        Request this
      </Button>
    )

  const send = () =>
    run(async () => {
      await createRequest({
        data: {
          spellId: detail.spellId,
          quantity: Number(quantity),
          deliverTo,
          hasMaterials,
          ask,
          note,
        },
      })
      await navigate({ to: '/requests' })
    })

  const label = 'mb-1 block text-xs text-stone-400'
  return (
    <form
      className="mt-4 space-y-3 rounded border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <div className="flex flex-wrap gap-3">
        <label>
          <span className={label}>How many</span>
          <Input
            type="number"
            min={1}
            max={200}
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value)
              const n = Math.floor(Number(e.target.value))
              props.onQuantity(n >= 1 ? Math.min(n, 200) : 1)
            }}
            className="w-20"
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className={label}>Send it to</span>
          {characters.length > 0 ? (
            <Select
              value={deliverTo}
              onChange={(e) => setDeliverTo(e.target.value)}
              className="w-full"
            >
              {characters.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </Select>
          ) : (
            <Input
              placeholder="Your character's name"
              value={deliverTo}
              onChange={(e) => setDeliverTo(e.target.value)}
              className="w-full"
            />
          )}
        </label>
      </div>
      <label className="block">
        <span className={label}>Ask</span>
        <Select
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          className="w-full"
        >
          <option value="">Anyone who can make it</option>
          {askable.map((c) => (
            <option key={c.character} value={c.character}>
              {c.player} ({c.character}, {c.skill})
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-2 text-stone-200">
        <input
          type="checkbox"
          checked={hasMaterials}
          onChange={(e) => setHasMaterials(e.target.checked)}
        />
        I will send the materials
      </label>
      <label className="block">
        <span className={label}>Note (optional)</span>
        <Input
          maxLength={300}
          placeholder="Anything the crafter should know"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Send request
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setQuantity('1')
            props.onQuantity(1)
          }}
        >
          Never mind
        </Button>
      </div>
      <p className="text-xs text-stone-500">
        It is posted in the guild’s updates channel
        {ask ? ', and the person you asked is notified.' : '.'}
      </p>
      <ErrorText error={error} />
    </form>
  )
}

/**
 * What the item does, as the game words it. A line with a tab has text on
 * both sides ("Bag" and "Cloth"); effects are green, flavour text is gold.
 */
function Tooltip({ lines }: { lines: Array<string> }) {
  return (
    <div className="mt-3 space-y-0.5 rounded border border-stone-700 bg-stone-900/70 px-3 py-2 text-sm text-stone-200">
      {lines.map((line, i) => {
        const [left, right] = line.split('\t')
        return (
          <p
            key={i}
            className={cx(
              'flex justify-between gap-4',
              /^(Use|Equip|Chance on hit|\(\d+\) Set):/.test(left) &&
                'text-emerald-400',
              left.startsWith('"') && 'text-amber-300',
            )}
          >
            <span>{left}</span>
            {right && <span>{right}</span>}
          </p>
        )
      })}
    </div>
  )
}

function BackToList({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="mb-3 block text-xs text-sky-300 hover:underline lg:hidden"
    >
      ← Back to the list
    </button>
  )
}

/** Skills with no recipes: just who has them. */
function Gathering({ professions }: { professions: Crafters }) {
  return (
    <Card title="Gathering">
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {professions.map((profession) => (
          <div key={profession.name}>
            <h3 className="mb-1 text-sm font-semibold text-stone-200">
              {profession.name}
            </h3>
            <ul className="space-y-0.5 text-sm">
              {profession.crafters.map((c) => (
                <li key={c.character} className="flex justify-between gap-2">
                  <span>
                    <Crafter {...c} />
                  </span>
                  <span className="text-stone-400">{c.skill}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Mine({ mine }: { mine: Awaited<ReturnType<typeof getMyRecipes>> }) {
  const router = useRouter()
  const { busy, error, run, setError } = useAction()
  const [lines, setLines] = useState<Array<string>>([])

  // The file is read in the browser; only the professions in it are sent.
  const upload = (file: File) =>
    run(async () => {
      setLines([])
      const crafting = craftingFromSavedVariables(await file.text())
      if (crafting.characters.length === 0) {
        setError(
          'No professions in that file. Log in with the Guildhall addon on, open each profession, then /reload.',
        )
        return
      }
      const result = await uploadCrafting({ data: crafting })
      setLines(result.lines)
      await router.invalidate()
    })

  return (
    <Card title="Your professions">
      {mine.length > 0 && (
        <div className="mb-4">
          <Table head={['Character', 'Profession', 'Skill', 'Recipes', 'Seen']}>
            {mine.map((p) => (
              <tr key={`${p.character} ${p.profession}`}>
                <td className="px-2 py-1.5 text-stone-200">{p.character}</td>
                <td className="px-2 py-1.5 text-stone-300">{p.profession}</td>
                <td className="px-2 py-1.5 text-stone-300">
                  {p.skill} / {p.maxSkill}
                </td>
                <td className="px-2 py-1.5 text-stone-400">
                  {p.recipes.length > 0 ? (
                    <details>
                      <summary className="cursor-pointer">
                        {p.recipes.length}
                      </summary>
                      {p.recipes.join(', ')}
                    </details>
                  ) : GATHERING.includes(p.profession) ? (
                    ''
                  ) : (
                    'open it in game to save them'
                  )}
                </td>
                <td className="px-2 py-1.5 text-stone-400">
                  {when(p.scannedAt)}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      <p className="mb-2 text-sm text-stone-300">
        The Guildhall addon reads what your characters can make, so nobody has
        to type it in:
      </p>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-stone-300">
        <li>
          In game, with the addon on, open each profession window once on each
          character.
        </li>
        <li>
          Type <code className="text-sky-300">/reload</code> (or log out) so the
          game saves the addon’s data.
        </li>
        <li>
          Choose{' '}
          <code className="text-sky-300">
            WTF/Account/&lt;account&gt;/SavedVariables/Guildhall.lua
          </code>{' '}
          from your game folder. Characters in it that nobody has claimed become
          yours.
        </li>
      </ol>
      <input
        type="file"
        accept=".lua"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
          e.target.value = ''
        }}
        className="text-sm text-stone-300 file:mr-3 file:rounded file:border-0 file:bg-sky-500 file:px-3 file:py-1.5 file:font-medium file:text-(--on-sky)"
      />
      {busy && <p className="mt-2 text-sm text-stone-400">Uploading…</p>}
      {lines.map((line) => (
        <p key={line} className="mt-2 text-sm text-emerald-300">
          {line}
        </p>
      ))}
      <ErrorText error={error} />
    </Card>
  )
}
