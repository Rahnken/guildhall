import { useState } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(' ')

export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cx(
        'rounded-lg border border-stone-800 bg-stone-950/60 p-4',
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}) {
  return (
    <button
      {...props}
      className={cx(
        'rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50',
        variant === 'primary' &&
          'bg-amber-500 text-stone-950 hover:bg-amber-400',
        variant === 'ghost' &&
          'border border-stone-700 text-stone-200 hover:bg-stone-800',
        variant === 'danger' && 'text-red-400 hover:bg-red-950',
        className,
      )}
    />
  )
}

const field =
  'rounded border border-stone-700 bg-stone-900 px-2 py-1.5 text-sm text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none'

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(field, className)} />
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(field, className)} />
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(field, 'font-mono', className)} />
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null
}

/** Run an async action with busy + error state. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, setError }
}

export function Table({
  head,
  children,
}: {
  head: Array<ReactNode>
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-800 text-left text-xs uppercase tracking-wide text-stone-500">
            {head.map((h, i) => (
              <th key={i} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-800/60">{children}</tbody>
      </table>
    </div>
  )
}

export { cx }
