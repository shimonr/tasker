import { FormEvent, useEffect, useState } from 'react'
import { createUser, deleteUser, fetchUsers, resetPassword, updateUser } from '../api'
import { User } from '../types'
import Navbar from '../components/Navbar'

interface AdminPageProps {
  user: User
  onLogout: () => void
}

export default function AdminPage({ user, onLogout }: AdminPageProps) {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('parent')
  const [password, setPassword] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [editUser, setEditUser] = useState<{
    username: string
    email: string
    full_name: string
    role: 'admin' | 'parent' | 'child'
  }>({
    username: '',
    email: '',
    full_name: '',
    role: 'parent',
  })
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({})

  const loadUsers = async () => {
    setLoadingUsers(true)
    try {
      const data = await fetchUsers()
      setUsers(data)
      if (!resetEmail && data.length > 0) {
        setResetEmail(data[0].email)
      }
    } catch (err) {
      showToast('Could not load users. Please refresh and try again.', 'error')
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(text)
    setToastType(type)
    setTimeout(() => setToastMessage(''), 3000)
  }

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await createUser({ username, email, full_name: fullName, role, password })
      showToast('User created successfully.', 'success')
      setEmail('')
      setUsername('')
      setFullName('')
      setPassword('')
      await loadUsers()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create user. Check the values and try again.'
      showToast(message, 'error')
    }
  }

  const handleEditUser = (user: User) => {
    setEditingUserId(user.id)
    setEditUser({
      username: user.username || '',
      email: user.email,
      full_name: user.full_name || '',
      role: user.role,
    })
  }

  const handleCancelEdit = () => {
    setEditingUserId(null)
    setEditUser({ username: '', email: '', full_name: '', role: 'parent' })
  }

  const handleSaveUser = async (userId: number) => {
    try {
      await updateUser(userId, editUser)
      showToast('User updated successfully.', 'success')
      setEditingUserId(null)
      setEditUser({ username: '', email: '', full_name: '', role: 'parent' })
      await loadUsers()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update user. Try again.'
      showToast(message, 'error')
    }
  }

  const handleDeleteUser = async (userId: number) => {
    try {
      await deleteUser(userId)
      showToast('User deleted successfully.', 'success')
      setUsers(users.filter((u) => u.id !== userId))
      if (editingUserId === userId) {
        handleCancelEdit()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete user. Try again.'
      showToast(message, 'error')
    }
  }

  const promptDeleteUser = (user: User) => {
    setUserToDelete(user)
  }

  const cancelDeleteUser = () => {
    setUserToDelete(null)
  }

  const confirmDeleteUser = async () => {
    if (!userToDelete) return
    await handleDeleteUser(userToDelete.id)
    setUserToDelete(null)
  }

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await resetPassword(resetEmail, resetPasswordValue)
      showToast('Password updated successfully.', 'success')
      setResetEmail('')
      setResetPasswordValue('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reset password. Verify the email address.'
      showToast(message, 'error')
    }
  }

  const togglePasswordVisibility = (userId: number) => {
    setVisiblePasswords((prev) => ({ ...prev, [userId]: !prev[userId] }))
  }

  return (
    <div className="relative mx-auto max-w-5xl px-4 py-8">
      <Navbar
        title={`Admin Console`}
        actions={
          <button onClick={onLogout} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm">
            Logout
          </button>
        }
      />

      {toastMessage && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-lg transition-opacity">
          <div className={toastType === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}>
            {toastMessage}
          </div>
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-200">
          <h2 className="text-2xl font-semibold text-slate-900">Create account</h2>
          <form className="mt-6 space-y-4" onSubmit={handleCreateUser}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
              required
            />
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
              required
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
            >
              <option value="parent">Parent</option>
              <option value="child">Child</option>
            </select>
            <button className="w-full rounded-2xl bg-brand-500 px-4 py-3 text-white transition hover:bg-brand-600">
              Create account
            </button>
          </form>
        </article>

        <article className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-200">
          <h2 className="text-2xl font-semibold text-slate-900">Reset password</h2>
          <form className="mt-6 space-y-4" onSubmit={handleResetPassword}>
            <select
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
              required
            >
              <option value="" disabled>
                Select a user
              </option>
              {users.map((userItem) => (
                <option key={userItem.id} value={userItem.email}>
                  {userItem.username || userItem.email}
                </option>
              ))}
            </select>
            <input
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              type="password"
              placeholder="New password"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500"
              required
            />
            <button className="w-full rounded-2xl bg-brand-500 px-4 py-3 text-white transition hover:bg-brand-600">
              Reset password
            </button>
          </form>
        </article>
      </section>

      <section className="mt-8 rounded-3xl bg-white p-6 shadow-lg shadow-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-slate-900">Manage users</h2>
          {loadingUsers && <span className="text-sm text-slate-500">Loading users...</span>}
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-700">
            <thead>
              <tr>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Full name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Password</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((userItem) => (
                <tr key={userItem.id} className="border-t border-slate-200">
                  <td className="px-4 py-3">
                    {editingUserId === userItem.id ? (
                      <input
                        value={editUser.username}
                        onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
                        className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                      />
                    ) : (
                      userItem.username || '-'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingUserId === userItem.id ? (
                      <input
                        value={editUser.email}
                        onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                        className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                      />
                    ) : (
                      userItem.email
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingUserId === userItem.id ? (
                      <input
                        value={editUser.full_name}
                        onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })}
                        className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                      />
                    ) : (
                      userItem.full_name || '-'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingUserId === userItem.id ? (
                      <select
                        value={editUser.role}
                        onChange={(e) => setEditUser({ ...editUser, role: e.target.value as 'admin' | 'parent' | 'child' })}
                        className="w-full rounded-2xl border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                      >
                        <option value="admin">Admin</option>
                        <option value="parent">Parent</option>
                        <option value="child">Child</option>
                      </select>
                    ) : (
                      userItem.role
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">
                        {visiblePasswords[userItem.id] ? '••••••••' : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(userItem.id)}
                        className="text-slate-400 hover:text-slate-600"
                        title={visiblePasswords[userItem.id] ? 'Hide password' : 'Show password'}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          {visiblePasswords[userItem.id] ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          ) : (
                            <>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </>
                          )}
                        </svg>
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">{new Date(userItem.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 space-x-2">
                    {editingUserId === userItem.id ? (
                      <>
                        <button
                          onClick={() => handleSaveUser(userItem.id)}
                          className="rounded-2xl bg-brand-500 px-3 py-2 text-white hover:bg-brand-600"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="rounded-2xl border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleEditUser(userItem)}
                          className="rounded-2xl border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => promptDeleteUser(userItem)}
                          className="rounded-2xl border border-red-300 px-3 py-2 text-red-600 hover:bg-red-50"
                          disabled={userItem.id === user.id}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl shadow-slate-900/10">
            <div className="mb-4 border-b border-slate-200 pb-4">
              <h3 className="text-xl font-semibold text-slate-900">Remove family member</h3>
              <p className="mt-2 text-sm text-slate-600">
                Are you sure you want to remove <strong>{userToDelete.full_name || userToDelete.username || userToDelete.email}</strong> from the household?
              </p>
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                This will permanently delete the account and remove access to the app.
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  onClick={cancelDeleteUser}
                  className="rounded-2xl border border-slate-300 px-4 py-3 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteUser}
                  className="rounded-2xl bg-red-500 px-4 py-3 text-white hover:bg-red-600"
                >
                  Confirm removal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
