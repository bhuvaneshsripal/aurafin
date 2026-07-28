import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import BoldDigits from './utils/boldDigits.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BoldDigits>
      <App />
    </BoldDigits>
  </StrictMode>,
)
