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
  const [editUser, setEditUser] = useState({
    username: '',
    email: '',
    full_name: '',
    role: 'parent',
  })
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  const loadUsers = async () => {
    setLoadingUsers(true)
    try {
      const data = await fetchUsers()
      setUsers(data)
      if (!resetEmail && data.length > 0) {
        setResetEmail(data[0].email)
      }
    } catch (err) {
      setMessage('Could not load users. Please refresh and try again.')
      setMessageType('error')
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage(text)
    setMessageType(type)
  }

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    showMessage('', 'success')
    try {
      await createUser({ username, email, full_name: fullName, role, password })
      showMessage('User created successfully.', 'success')
      setEmail('')
      setUsername('')
      setFullName('')
      setPassword('')
      await loadUsers()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create user. Check the values and try again.'
      showMessage(message, 'error')
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
    setMessage('')
  }

  const handleCancelEdit = () => {
    setEditingUserId(null)
    setEditUser({ username: '', email: '', full_name: '', role: 'parent' })
  }

  const handleSaveUser = async (userId: number) => {
    showMessage('', 'success')
    try {
      await updateUser(userId, editUser)
      showMessage('User updated successfully.', 'success')
      setEditingUserId(null)
      setEditUser({ username: '', email: '', full_name: '', role: 'parent' })
      await loadUsers()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update user. Try again.'
      showMessage(message, 'error')
    }
  }

  const handleDeleteUser = async (userId: number) => {
    try {
      await deleteUser(userId)
      showMessage('User deleted successfully.', 'success')
      setUsers(users.filter((user) => user.id !== userId))
      if (editingUserId === userId) {
        handleCancelEdit()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete user. Try again.'
      showMessage(message, 'error')
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
    showMessage('', 'success')
    try {
      await resetPassword(resetEmail, resetPasswordValue)
      showMessage('Password updated successfully.', 'success')
      setResetEmail('')
      setResetPasswordValue('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reset password. Verify the email address.'
      showMessage(message, 'error')
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Navbar
        title={`Admin Console`}
        actions={
          <button onClick={onLogout} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm">
            Logout
          </button>
        }
      />
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
                        onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
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

      {message && (
        <p
          className={`mt-6 rounded-3xl p-4 ${
            messageType === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {message}
        </p>
      )}

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
