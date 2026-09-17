import type { FC } from 'react'
import { TITLE_SOFT_LIMIT, BODY_SOFT_LIMIT } from '../validation'
import './NotificationPreview.css'

interface NotificationPreviewProps {
  title: string
  body: string
  imageUrl: string
}

/**
 * Approximation of the Android notification shade.
 *
 * Not decoration: the tray cuts the title to roughly one line and the body to a few, and
 * writing copy against a textarea is how a campaign ships with its call to action off the
 * bottom edge. The ellipsis here is the same one a device would show, so what is lost is
 * visible while the words are still editable.
 *
 * It is an approximation, not an emulator — per-device fonts and widths vary, and the soft
 * limits are deliberately conservative.
 */
export const NotificationPreview: FC<NotificationPreviewProps> = ({ title, body, imageUrl }) => {
  const shownTitle = title.trim() || 'Notification title'
  const shownBody = body.trim() || 'Notification body text goes here.'

  return (
    <div className="push-preview">
      <div className="push-preview-label">Preview</div>
      <div className="push-preview-shade">
        <div className="push-preview-header">
          <span className="push-preview-icon" aria-hidden="true" />
          <span className="push-preview-app">Decentraland</span>
          <span className="push-preview-time">now</span>
        </div>
        <div className={`push-preview-title ${title.trim().length > TITLE_SOFT_LIMIT ? 'push-preview-clipped' : ''}`}>
          {shownTitle}
        </div>
        <div className={`push-preview-body ${body.trim().length > BODY_SOFT_LIMIT ? 'push-preview-clipped' : ''}`}>
          {shownBody}
        </div>
        {imageUrl.trim() ? (
          // The device downloads this with a short timeout and falls back to a text-only
          // notification, so a broken URL degrades rather than failing the send. Showing the
          // broken state here is the only warning anybody gets.
          <img className="push-preview-image" src={imageUrl.trim()} alt="" />
        ) : null}
      </div>
      <p className="push-preview-note">
        Approximate. Real width and truncation vary by device.
      </p>
    </div>
  )
}
