import type { FC } from 'react'
import './AppTabs.css'

export type AppView =
  | 'map'
  | 'worlds'
  | 'curation'
  | 'versions'
  | 'flags'
  | 'devices'
  | 'campaigns'
  | 'push'
  | 'creator-fund'

interface AppTabsProps {
  activeView: AppView
  onViewChange: (view: AppView) => void
  /** Only a wallet the creators-data service lists as a Creator Fund admin gets the tab. */
  showCreatorFund?: boolean
}

export const AppTabs: FC<AppTabsProps> = ({ activeView, onViewChange, showCreatorFund = false }) => {
  return (
    <div className="app-tabs">
      <button
        className={`app-tab ${activeView === 'map' ? 'app-tab-active' : ''}`}
        onClick={() => onViewChange('map')}
      >
        Map
      </button>
      <button
        className={`app-tab ${activeView === 'worlds' ? 'app-tab-active' : ''}`}
        onClick={() => onViewChange('worlds')}
      >
        Worlds
      </button>
      <button
        className={`app-tab ${activeView === 'curation' ? 'app-tab-active' : ''}`}
        onClick={() => onViewChange('curation')}
      >
        Curation
      </button>
      <button
        className={`app-tab ${activeView === 'versions' ? 'app-tab-active' : ''}`}
        onClick={() => onViewChange('versions')}
      >
        Versions
      </button>
      <button
        className={`app-tab ${activeView === 'flags' ? 'app-tab-active' : ''}`}
        onClick={() => onViewChange('flags')}
      >
        Feature Flags
      </button>
      <button
        className={`app-tab ${activeView === 'devices' ? 'app-tab-active' : ''}`}
        onClick={() => onViewChange('devices')}
      >
        Device Support
      </button>
      <button
        className={`app-tab ${activeView === 'campaigns' ? 'app-tab-active' : ''}`}
        onClick={() => onViewChange('campaigns')}
      >
        Campaigns
      </button>
      <button
        className={`app-tab ${activeView === 'push' ? 'app-tab-active' : ''}`}
        onClick={() => onViewChange('push')}
      >
        Push
      </button>
      {showCreatorFund && (
        <button
          className={`app-tab ${activeView === 'creator-fund' ? 'app-tab-active' : ''}`}
          onClick={() => onViewChange('creator-fund')}
        >
          Creator Fund
        </button>
      )}
    </div>
  )
}
