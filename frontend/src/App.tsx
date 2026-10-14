import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { getMe, login, setAuthToken, setUnauthorizedHandler } from './api'
import type { User, UserRole } from './types'
import { homeFor } from './lib/tasks'
import AdminPage from './pages/AdminPage'
import ChildDashboard from './pages/ChildDashboard'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import LoginPage from './pages/LoginPage'
import ParentDashboard from './pages/ParentDashboard'
import ResetPasswordPage from './pages/ResetPasswordPage'

export const TOKEN_KEY = 'tasker_token'

function Decorations() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden text-4xl opacity-40 sm:text-6xl">
      <span className="absolute left-[4%] top-[18%] animate-floaty">☁️</span>
      <span className="absolute right-[6%] top-[30%] animate-floaty [animation-delay:1.5s]">⭐</span>
      <span className="absolute bottom-[12%] left-[8%] animate-floaty [animation-delay:3s]">🌈</span>
      <span className="absolute bottom-[20%] right-[10%] animate-floaty [animation-delay:2s]">🪁</span>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setAuthToken(null)
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(handleLogout)
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setLoading(false)
      return
    }
    setAuthToken(token)
    getMe()
      .then(setUser)
      .catch(handleLogout)
      .finally(() => setLoading(false))
  }, [handleLogout])

  const handleLogin = async (username: string, password: string) => {
    const { access_token } = await login(username, password)
    localStorage.setItem(TOKEN_KEY, access_token)
    setAuthToken(access_token)
    setUser(await getMe())
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-2xl font-bold text-grape-700">
        <span className="mr-3 animate-wiggle text-5xl">🎈</span> Loading…
      </div>
    )
  }

  const page = (role: UserRole) => {
    if (user?.role !== role) return <Navigate to={user ? homeFor(user.role) : '/login'} replace />
    const props = { user, onLogout: handleLogout }
    return { admin: <AdminPage {...props} />, parent: <ParentDashboard {...props} />, child: <ChildDashboard {...props} /> }[role]
  }
  const publicPage = (element: JSX.Element) => (user ? <Navigate to={homeFor(user.role)} replace /> : element)

  return (
    <BrowserRouter>
      <Decorations />
      <Routes>
        <Route path="/login" element={publicPage(<LoginPage onLogin={handleLogin} />)} />
        <Route path="/forgot-password" element={publicPage(<ForgotPasswordPage />)} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/parent" element={page('parent')} />
        <Route path="/child" element={page('child')} />
        <Route path="/admin" element={page('admin')} />
        <Route path="*" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
