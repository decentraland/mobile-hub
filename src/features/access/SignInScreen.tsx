import type { FC } from 'react'

interface SignInScreenProps {
  onSignIn: () => void
}

export const SignInScreen: FC<SignInScreenProps> = ({ onSignIn }) => (
  <div className="access-screen">
    <div className="access-card">
      <h1>Mobile Hub</h1>
      <p>Sign in with your wallet to access the admin.</p>
      <div className="access-card-actions">
        <button className="access-button-primary" onClick={onSignIn}>
          Sign In
        </button>
      </div>
    </div>
  </div>
)
