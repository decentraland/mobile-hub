import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ChainId } from '@dcl/schemas'
import { AuthProvider } from './contexts/auth'
import { Navbar } from './components/Navbar'
import { MapPage } from './pages/MapPage'
import { config } from './config'

// Base path injected by the server (see index.html)
// When served from /hub/, the server rewrites __BASE_PATH__ to "/hub"
declare global {
  interface Window {
    __BASE_PATH__?: string
  }
}

const basePath = window.__BASE_PATH__ || ''

const authConfig = {
  defaultChainId: Number(config.get('CHAIN_ID')) as ChainId,
  authUrl: config.get('AUTH_URL'),
  basePath: basePath || '/mobile-curation'
}

function App() {
  return (
    <BrowserRouter basename={basePath}>
      <AuthProvider config={authConfig}>
        <Navbar />
        <Routes>
          <Route path="/map" element={<MapPage />} />
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
