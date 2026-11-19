// Must run before anything formats a date: makes US Eastern the default timezone.
import './lib/forceEasternTime'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { APP_COMPANY_NAME } from './constants/appBranding'
import { applyDocumentBrandAssets } from './constants/appLogo'

applyDocumentBrandAssets(APP_COMPANY_NAME)

createRoot(document.getElementById('root')!).render(<App />)
