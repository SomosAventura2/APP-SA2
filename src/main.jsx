import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './iosPwaLocks.js'
import { NotifyProvider } from './context/NotifyContext.jsx'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NotifyProvider>
      <App />
    </NotifyProvider>
  </StrictMode>,
)
