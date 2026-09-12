import type { FC } from 'react'
import { shortenAddress } from './shortenAddress'

interface NoAccessModalProps {
  address: string
  onClose: () => void
}

export const NoAccessModal: FC<NoAccessModalProps> = ({ address, onClose }) => (
  <div className="access-modal-backdrop" onClick={onClose}>
    <div className="access-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
      <h3>No permissions</h3>
      <p>This wallet is not allowed to use the Mobile Hub admin. Ask an administrator to add it, then sign in again.</p>
      <code className="access-modal-address">{shortenAddress(address)}</code>
      <div className="access-modal-actions">
        <button className="access-button-primary" onClick={onClose}>
          Sign out
        </button>
      </div>
    </div>
  </div>
)
