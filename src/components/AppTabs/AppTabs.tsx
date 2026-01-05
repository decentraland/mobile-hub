import type { FC } from 'react'
import './AppTabs.css'

export type AppView = 'map' | 'worlds'

interface AppTabsProps {
  activeView: AppView
  onViewChange: (view: AppView) => void
}

export const AppTabs: FC<AppTabsProps> = ({ activeView, onViewChange }) => {
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
    </div>
  )
}
