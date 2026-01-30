import type { FC } from 'react'
import { CurationPage as CurationPageContent } from '../features/curation'
import './CurationPage.css'

export const CurationPage: FC = () => {
  return (
    <div className="curation-page">
      <CurationPageContent />
    </div>
  )
}
