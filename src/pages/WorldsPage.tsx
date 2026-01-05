import type { FC } from 'react'
import './WorldsPage.css'

export const WorldsPage: FC = () => {
  return (
    <div className="worlds-page">
      <div className="worlds-container">
        <div className="worlds-search-section">
          <h2>Ban a World</h2>
          <div className="worlds-search-box">
            <input
              type="text"
              placeholder="Enter world name (e.g., boedo.dcl.eth)"
              className="worlds-search-input"
            />
            <button className="worlds-search-button">
              Ban World
            </button>
          </div>
        </div>

        <div className="worlds-list-section">
          <h3>Banned Worlds</h3>
          <p className="worlds-empty-state">No banned worlds yet.</p>
        </div>
      </div>
    </div>
  )
}
