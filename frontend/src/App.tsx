import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { getMe, login, setAuthToken } from './api'
import { User } from './types'
import LoginPage from './pages/LoginPage'
import ParentDashboard from './pages/ParentDashboard'
import ChildDashboard from './pages/ChildDashboard'
import AdminPage from './pages/AdminPage'

const LOCAL_TOKEN_KEY = 'tasker_token'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(LOCAL_TOKEN_KEY)
    if (token) {
      setAuthToken(token)
      getMe()
        .then((me) => setUser(me))
        .catch(() => {
          localStorage.removeItem(LOCAL_TOKEN_KEY)
          setAuthToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const handleLogin = async (username: string, password: string) => {
    const tokenData = await login(username, password)
    localStorage.setItem(LOCAL_TOKEN_KEY, tokenData.access_token)
    setAuthToken(tokenData.access_token)
    const me = await getMe()
    setUser(me)
    // return the user to caller so the caller can navigate client-side
    return me
  }

  const handleLogout = () => {
    localStorage.removeItem(LOCAL_TOKEN_KEY)
    setAuthToken(null)
    setUser(null)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50 to-white text-slate-900">
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route
            path="/parent"
            element={user?.role === 'parent' ? <ParentDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
          />
          <Route
            path="/child"
            element={user?.role === 'child' ? <ChildDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
          />
          <Route
            path="/admin"
            element={user?.role === 'admin' ? <AdminPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />}
          />
          <Route
            path="/*"
            element={
              user ? (
                <Navigate to={user.role === 'parent' ? '/parent' : user.role === 'child' ? '/child' : '/admin'} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
