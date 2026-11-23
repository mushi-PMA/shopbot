import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Admin } from './Admin'
import { Store } from './Store'
import './styles.css'

const page = window.location.pathname.startsWith('/admin') ? <Admin /> : <Store />

createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>)
