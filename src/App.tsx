import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ChainId } from '@dcl/schemas'
import { AuthProvider } from './contexts/auth'
import { Navbar } from './components/Navbar'
import { MapPage } from './pages/MapPage'
import { config } from './config'

const authConfig = {
  defaultChainId: Number(config.get('CHAIN_ID')) as ChainId,
  authUrl: config.get('AUTH_URL'),
  basePath: '/mobile-hub'
}
const basename = /^decentraland.(zone|org|today)$/.test(window.location.host) ? '/mobile-hub' : '/'

function App() {
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider config={authConfig}>
        <Navbar />
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
