import { useState } from 'react'
import type { FC } from 'react'
import { useAuth } from '../../contexts/auth'
import './Navbar.css'

export const Navbar: FC = () => {
  const { avatar, wallet, isSignedIn, isConnecting, signIn, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const avatarUrl = avatar?.avatar?.snapshots?.face256

  if (isConnecting) {
    return (
      <div className="navbar-container">
        <div className="navbar-bar">
          <button className="navbar-button" disabled>
            Connecting...
          </button>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="navbar-container">
        <div className="navbar-bar">
          <button className="navbar-button" onClick={signIn}>
            <span className="navbar-button-icon">👤</span>
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="navbar-container">
      <div className="navbar-bar">
        <button className="navbar-avatar-button" onClick={() => setMenuOpen(!menuOpen)}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="navbar-avatar" />
          ) : (
            <span className="navbar-avatar-placeholder">
              {wallet?.slice(2, 4).toUpperCase()}
            </span>
          )}
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="navbar-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="navbar-menu">
            <div className="navbar-menu-address">
              {wallet?.slice(0, 6)}...{wallet?.slice(-4)}
            </div>
            <button
              className="navbar-menu-item"
              onClick={() => { setMenuOpen(false); signOut(); }}
            >
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
