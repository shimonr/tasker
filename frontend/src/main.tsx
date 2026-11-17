import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/fredoka'
import App from './App'
import { registerServiceWorker } from './lib/push'
import './index.css'

registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
