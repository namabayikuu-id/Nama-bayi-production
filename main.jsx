import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { PrivacyPolicy, TermsOfService } from './PolicyPages.jsx'
import './App.css'

// Router sederhana tanpa library tambahan
function Root() {
  const path = window.location.pathname
  if (path === '/privacy') return <PrivacyPolicy />
  if (path === '/tos')     return <TermsOfService />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />)
