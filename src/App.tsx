import { useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { ChainId } from '@dcl/schemas'
import { AuthProvider } from './contexts/auth'
import { Navbar } from './components/Navbar'
import { AppTabs, type AppView } from './components/AppTabs'
import { PlacesPage } from './pages/PlacesPage'
import { VersionsPage } from './pages/VersionsPage'
import { FeatureFlagsPage } from './pages/FeatureFlagsPage'
import { DeviceSupportPage } from './pages/DeviceSupportPage'
import { CampaignsPage } from './pages/CampaignsPage'
import { PushPage } from './pages/PushPage'
import { CreatorFundPage } from './pages/CreatorFundPage'
import { useIsCreatorFundAdmin } from './features/creator-fund/useIsCreatorFundAdmin'
import { config } from './config'

const authConfig = {
  defaultChainId: Number(config.get('CHAIN_ID')) as ChainId,
  authUrl: config.get('AUTH_URL'),
  basePath: '/mobile-hub'
}
const basename = /^decentraland.(zone|org|today)$/.test(window.location.host) ? '/mobile-hub' : '/'

// Below the providers, so the admin gate can read the auth context.
function Hub() {
  const [activeView, setActiveView] = useState<AppView>('places')
  const isCreatorFundAdmin = useIsCreatorFundAdmin()

  return (
    <>
      <Navbar
        tabs={
          <AppTabs
            activeView={activeView}
            onViewChange={setActiveView}
            showCreatorFund={isCreatorFundAdmin}
          />
        }
      />
      {activeView === 'places' && <PlacesPage />}
      {activeView === 'versions' && <VersionsPage />}
      {activeView === 'flags' && <FeatureFlagsPage />}
      {activeView === 'devices' && <DeviceSupportPage />}
      {activeView === 'campaigns' && <CampaignsPage />}
      {activeView === 'push' && <PushPage />}
      {activeView === 'creator-fund' && isCreatorFundAdmin && <CreatorFundPage />}
    </>
  )
}

function App() {
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider config={authConfig}>
        <Hub />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
