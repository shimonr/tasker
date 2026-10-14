import { FormEvent, useCallback, useEffect, useState } from 'react'
import { createUser, deleteUser, fetchUsers, resetPassword, updateUser } from '../api'
import type { User, UserRole } from '../types'
import Modal from '../components/Modal'
import Navbar from '../components/Navbar'
import { useToast } from '../components/Toast'
import { kidEmoji, userName } from '../lib/tasks'

interface AdminPageProps {
  user: User
  onLogout: () => void
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'parent', label: '🦸 Parent' },
  { value: 'child', label: '🌟 Kid' },
  { value: 'admin', label: '🛡️ Admin' },
]
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label])) as Record<UserRole, string>
const emptyAccount = { username: '', email: '', full_name: '', role: 'parent' as UserRole, password: '' }

export default function AdminPage({ user, onLogout }: AdminPageProps) {
  const [users, setUsers] = useState<User[]>([])
  const [account, setAccount] = useState(emptyAccount)
  const [resetEmail, setResetEmail] = useState('')
  const [resetValue, setResetValue] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState({ username: '', email: '', full_name: '', role: 'parent' as UserRole })
  const [deleting, setDeleting] = useState<User | null>(null)
  const { toast, attempt } = useToast()
  const cancelDelete = () => setDeleting(null)

  const load = useCallback(async () => setUsers(await fetchUsers()), [])

  useEffect(() => {
    attempt(load)
  }, [attempt, load])

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    return attempt(async () => {
      await createUser(account)
      setAccount(emptyAccount)
      await load()
    }, 'Account created! A welcome email is on its way.')
  }

  const handleReset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    return attempt(async () => {
      await resetPassword(resetEmail, resetValue)
      setResetValue('')
    }, 'Password updated. Old sessions were signed out.')
  }

  const startEdit = (target: User) => {
    setEditingId(target.id)
    setDraft({ username: target.username ?? '', email: target.email, full_name: target.full_name ?? '', role: target.role })
  }

  const saveEdit = (userId: number) =>
    attempt(async () => {
      await updateUser(userId, draft)
      setEditingId(null)
      await load()
    }, 'Saved!')

  const field = (key: 'username' | 'email' | 'full_name', label: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className="input py-2" />
    </label>
  )

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <Navbar user={user} onLogout={onLogout} />
      {toast}
      <h1 className="mb-4 text-3xl text-grape-900">🛡️ Family control center</h1>

      <section className="grid gap-6 lg:grid-cols-2">
        <form className="card space-y-3 border-leaf-200" onSubmit={handleCreate} aria-label="Create account">
          <h2 className="text-2xl text-grape-900">➕ Add a family member</h2>
          <input aria-label="Username" placeholder="Username" autoCapitalize="none" value={account.username} onChange={(e) => setAccount({ ...account, username: e.target.value })} className="input" />
          <input aria-label="Email" type="email" placeholder="Email" required value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} className="input" />
          <input aria-label="Full name" placeholder="Full name" value={account.full_name} onChange={(e) => setAccount({ ...account, full_name: e.target.value })} className="input" />
          <input
            aria-label="Password"
            type="password"
            placeholder="Password (8+ characters)"
            autoComplete="new-password"
            minLength={8}
            required
            value={account.password}
            onChange={(e) => setAccount({ ...account, password: e.target.value })}
            className="input"
          />
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Role">
            {ROLES.map((role) => (
              <label key={role.value} className="choice text-sm">
                <input type="radio" name="new-role" className="sr-only" checked={account.role === role.value} onChange={() => setAccount({ ...account, role: role.value })} />
                {role.label}
              </label>
            ))}
          </div>
          <button type="submit" className="btn-success w-full">
            ✨ Create account
          </button>
        </form>

        <form className="card space-y-3 border-ocean-200" onSubmit={handleReset} aria-label="Reset password">
          <h2 className="text-2xl text-grape-900">🔑 Reset a password</h2>
          <p className="text-sm text-grape-700">Family members can also reset their own password from the sign-in page.</p>
          <select aria-label="Account" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className="input" required>
            <option value="" disabled>
              Choose someone…
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.email}>
                {userName(u)} ({u.email})
              </option>
            ))}
          </select>
          <input
            aria-label="New password"
            type="password"
            placeholder="New password (8+ characters)"
            autoComplete="new-password"
            minLength={8}
            required
            value={resetValue}
            onChange={(e) => setResetValue(e.target.value)}
            className="input"
          />
          <button type="submit" className="btn-primary w-full">
            🔐 Set new password
          </button>
        </form>
      </section>

      <section className="card mt-6 border-grape-100">
        <h2 className="text-2xl text-grape-900">👨‍👩‍👧‍👦 Everyone ({users.length})</h2>
        <ul className="mt-4 space-y-3">
          {users.map((u) => (
            <li key={u.id} className="rounded-3xl border-2 border-grape-50 bg-grape-50/50 p-4">
              {editingId === u.id ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {field('username', 'Username')}
                  {field('email', 'Email')}
                  {field('full_name', 'Full name')}
                  <label className="block">
                    <span className="label">Role</span>
                    <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })} className="input py-2">
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2 sm:col-span-2">
                    <button type="button" className="btn-primary btn-sm" onClick={() => saveEdit(u.id)}>
                      💾 Save
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-3xl" aria-hidden="true">
                    {kidEmoji(u.id)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold text-grape-900">
                      {userName(u)} {u.username && <span className="font-normal text-grape-400">@{u.username}</span>}
                    </p>
                    <p className="truncate text-sm text-grape-700">{u.email}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-grape-400">
                      <span className="chip bg-white py-0.5 text-grape-700">{ROLE_LABEL[u.role]}</span>
                      Joined {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <button type="button" className="btn-ghost btn-sm flex-1" onClick={() => startEdit(u)} aria-label={`Edit ${userName(u)}`}>
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm flex-1 text-rose-500"
                      disabled={u.id === user.id}
                      onClick={() => setDeleting(u)}
                      aria-label={`Remove ${userName(u)}`}
                    >
                      🗑️ Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {deleting && (
        <Modal title={`Remove ${userName(deleting)}?`} subtitle="Careful!" onClose={cancelDelete}>
          <p className="text-grape-700">This permanently deletes the account, their tasks and their stars.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-ghost" onClick={cancelDelete}>
              Keep
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() =>
                attempt(async () => {
                  await deleteUser(deleting.id)
                  setDeleting(null)
                  await load()
                }, 'Account removed.')
              }
            >
              🗑️ Remove
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
