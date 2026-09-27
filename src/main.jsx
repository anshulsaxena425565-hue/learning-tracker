import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { CreditsProvider } from './context/CreditsContext'
import './styles.css'
createRoot(document.getElementById('root')).render(<StrictMode><CreditsProvider><App /></CreditsProvider></StrictMode>)
