import { useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { ChainId } from '@dcl/schemas'
import { AuthProvider } from './contexts/auth'
import { BansProvider } from './features/map/context/BansContext'
import { Navbar } from './components/Navbar'
import { AppTabs, type AppView } from './components/AppTabs'
import { MapPage } from './pages/MapPage'
import { WorldsPage } from './pages/WorldsPage'
import { CurationPage } from './pages/CurationPage'
import { config } from './config'

const authConfig = {
  defaultChainId: Number(config.get('CHAIN_ID')) as ChainId,
  authUrl: config.get('AUTH_URL'),
  basePath: '/mobile-hub'
}
const basename = /^decentraland.(zone|org|today)$/.test(window.location.host) ? '/mobile-hub' : '/'

function App() {
  const [activeView, setActiveView] = useState<AppView>('map')

  return (
    <BrowserRouter basename={basename}>
      <AuthProvider config={authConfig}>
        <BansProvider>
          <Navbar
            tabs={<AppTabs activeView={activeView} onViewChange={setActiveView} />}
          />
          {activeView === 'map' && <MapPage />}
          {activeView === 'worlds' && <WorldsPage />}
          {activeView === 'curation' && <CurationPage />}
        </BansProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
