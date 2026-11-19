/**
 * Sign-in state lives in one signed cookie, so there is no session table.
 * Roles are read from Discord at sign-in; a role change (or leaving the
 * server) takes effect when the cookie expires or the member signs in again.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server'

import { config } from './config.server'

export type Viewer = { id: string; name: string; officer: boolean }

const COOKIE = 'guildhall_session'
const MAX_AGE = 7 * 24 * 60 * 60

const sign = (payload: string) =>
  createHmac('sha256', config.sessionSecret).update(payload).digest('base64url')

export function startSession(viewer: Viewer) {
  const payload = Buffer.from(
    JSON.stringify({ ...viewer, exp: Math.floor(Date.now() / 1000) + MAX_AGE }),
  ).toString('base64url')
  setCookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicUrl.startsWith('https://'),
    path: '/',
    maxAge: MAX_AGE,
  })
}

export function endSession() {
  deleteCookie(COOKIE, { path: '/' })
}

export function getViewer(): Viewer | null {
  const cookie = getCookie(COOKIE)
  if (!cookie) return null
  const [payload, signature] = cookie.split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof data.exp !== 'number' || data.exp < Date.now() / 1000)
      return null
    return {
      id: String(data.id),
      name: String(data.name),
      officer: data.officer === true,
    }
  } catch {
    return null
  }
}

export function requireMember(): Viewer {
  const viewer = getViewer()
  if (!viewer) throw new Error('Sign in with Discord to see this.')
  return viewer
}

export function requireOfficer(): Viewer {
  const viewer = requireMember()
  if (!viewer.officer) throw new Error('This is for officers only.')
  return viewer
}
