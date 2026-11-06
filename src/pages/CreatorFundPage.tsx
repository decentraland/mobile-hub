import { useEffect, useState, type FC, type ReactNode } from 'react'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import {
  deleteNews,
  excludeCreator,
  excludePlace,
  getCreators,
  getCycles,
  getCyclePlaces,
  getExclusions,
  getNews,
  getTerms,
  includeCreator,
  includePlace,
  publishTerms,
  putCycle,
  putNews,
  runSweep,
  setCreatorStatus,
  type AdminCreator,
  type AdminCyclePlace,
  type AuthenticatedFetch,
  type CreatorExclusionReason,
  type Cycle,
  type Exclusions,
  type NewsItem,
  type PlaceExclusionReason,
  type SweepResult,
  type Terms,
} from '../features/creator-fund/api'
import './CreatorFundPage.css'

/** One line of the review step: what a field is now and what it becomes. */
interface Change {
  label: string
  before?: string
  after: string
}

/** One write, reviewed before it runs. The page reloads and shows `success` once it has. */
interface Action {
  title: string
  confirmLabel: string
  changes: Change[]
  warning?: string
  danger?: boolean
  success: string
  run: () => Promise<void>
}

type ReviewState =
  | { status: 'idle' }
  | { status: 'reviewing'; action: Action }
  | { status: 'saving'; action: Action }
  | { status: 'error'; action: Action; message: string }

interface PageData {
  cycles: Cycle[]
  terms: Terms | null
  news: NewsItem[]
  creators: AdminCreator[]
  exclusions: Exclusions
}

const PLACE_REASONS: ReadonlyArray<{ value: PlaceExclusionReason; label: string; hint: string }> = [
  { value: 'content_policy', label: 'Content policy', hint: 'The creator sees "fails the Content Policy" on the card.' },
  { value: 'excluded', label: 'Excluded', hint: 'The creator sees "excluded from the programme", with no reason given.' },
]
const CREATOR_REASONS: ReadonlyArray<{ value: CreatorExclusionReason; label: string; hint: string }> = [
  { value: 'internal', label: 'Internal account', hint: 'Foundation or Regenesis Labs. They are told internal accounts cannot join.' },
  { value: 'excluded', label: 'Excluded', hint: 'They are told the account is not eligible, with no reason given.' },
]

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function formatPool(pool: number | null): string {
  return pool === null ? 'unset' : `${pool.toLocaleString()} USDC`
}

/** An ISO instant as a `datetime-local` input wants it, in the browser's zone. */
function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function nextId(items: Array<{ id: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1
}

function creatorsToCsv(creators: AdminCreator[]): string {
  const columns: Array<keyof AdminCreator> = [
    'address',
    'first_name',
    'last_name',
    'email',
    'email_verified_at',
    'status',
    'enrolled_at',
    'terms_version',
  ]
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [columns.join(','), ...creators.map(creator => columns.map(column => cell(creator[column])).join(','))].join(
    '\n'
  )
}

async function loadPage(authenticatedFetch: AuthenticatedFetch): Promise<{ data: PageData } | { error: string }> {
  try {
    const [cycles, terms, news, creators, exclusions] = await Promise.all([
      getCycles(),
      getTerms(),
      getNews(),
      getCreators(authenticatedFetch),
      getExclusions(authenticatedFetch),
    ])
    return { data: { cycles, terms, news, creators, exclusions } }
  } catch (err) {
    return { error: errorMessage(err, 'Failed to load the Creator Fund') }
  }
}

export const CreatorFundPage: FC = () => {
  const authenticatedFetch = useAuthenticatedFetch()
  const [data, setData] = useState<PageData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [review, setReview] = useState<ReviewState>({ status: 'idle' })
  const [toast, setToast] = useState<string | null>(null)
  // Bumped after every confirmed write and by Retry, so the whole page re-reads what the service holds.
  const [generation, setGeneration] = useState(0)
  const reload = () => setGeneration(current => current + 1)

  useEffect(() => {
    let cancelled = false
    loadPage(authenticatedFetch).then(result => {
      if (cancelled) return
      if ('error' in result) {
        setLoadError(result.error)
      } else {
        setData(result.data)
        setLoadError(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [authenticatedFetch, generation])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const ask = (action: Action) => setReview({ status: 'reviewing', action })

  const handleConfirm = async () => {
    if (review.status !== 'reviewing' && review.status !== 'error') return
    const { action } = review
    setReview({ status: 'saving', action })
    try {
      await action.run()
      setReview({ status: 'idle' })
      setToast(action.success)
      reload()
    } catch (err) {
      setReview({ status: 'error', action, message: errorMessage(err, 'The change was not saved') })
    }
  }

  return (
    <div className="cf-page">
      <div className="cf-container">
        <header className="cf-header">
          <h1>Creator Fund</h1>
          <p>
            What creators-data serves to Creator Hub's Earn tab. Every change is reviewed before it runs and is
            recorded with your wallet.
          </p>
        </header>

        {loadError && (
          <div className="cf-error">
            {loadError}{' '}
            <button className="cf-link-button" onClick={reload}>
              Retry
            </button>
          </div>
        )}
        {!data && !loadError && <div className="cf-loading">Loading…</div>}

        {data && (
          <>
            <CyclesSection cycles={data.cycles} authenticatedFetch={authenticatedFetch} ask={ask} />
            <TermsSection terms={data.terms} authenticatedFetch={authenticatedFetch} ask={ask} />
            <NewsSection news={data.news} authenticatedFetch={authenticatedFetch} ask={ask} />
            <CreatorsSection
              creators={data.creators}
              excluded={new Set(data.exclusions.creators.map(exclusion => exclusion.address))}
              authenticatedFetch={authenticatedFetch}
              ask={ask}
            />
            <ExclusionsSection exclusions={data.exclusions} authenticatedFetch={authenticatedFetch} ask={ask} />
            <CyclePlacesSection
              cycles={data.cycles}
              excluded={new Set(data.exclusions.places.map(exclusion => exclusion.place_id))}
              authenticatedFetch={authenticatedFetch}
              ask={ask}
            />
            <SweepSection authenticatedFetch={authenticatedFetch} ask={ask} />
          </>
        )}
      </div>

      {review.status !== 'idle' && (
        <ReviewDialog state={review} onConfirm={handleConfirm} onCancel={() => setReview({ status: 'idle' })} />
      )}
      {toast && (
        <div className="cf-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

interface SectionProps {
  authenticatedFetch: AuthenticatedFetch
  ask: (action: Action) => void
}

const Section: FC<{ title: string; hint?: string; action?: ReactNode; children: ReactNode }> = ({
  title,
  hint,
  action,
  children,
}) => (
  <section className="cf-section">
    <div className="cf-section-head">
      <div>
        <h2>{title}</h2>
        {hint && <p className="cf-hint">{hint}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
)

/** The shell every editor shares: backdrop, Escape to close, the first field focused. */
const Dialog: FC<{ title: string; onClose: () => void; children: ReactNode; wide?: boolean }> = ({
  title,
  onClose,
  children,
  wide,
}) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="cf-modal-backdrop" onClick={onClose}>
      <div
        className={`cf-modal ${wide ? 'cf-modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

const Field: FC<{ label: string; hint?: string; error?: string | null; children: ReactNode }> = ({
  label,
  hint,
  error,
  children,
}) => (
  <label className={`cf-field ${error ? 'cf-field-invalid' : ''}`}>
    <span className="cf-field-label">{label}</span>
    {children}
    {error ? <span className="cf-field-error">{error}</span> : hint ? <span className="cf-field-hint">{hint}</span> : null}
  </label>
)

/* ---------------------------------- cycles ---------------------------------- */

const CyclesSection: FC<SectionProps & { cycles: Cycle[] }> = ({ cycles, authenticatedFetch, ask }) => {
  const [editing, setEditing] = useState<Cycle | 'new' | null>(null)

  return (
    <Section
      title="Cycles"
      hint="A cycle's status comes from its dates. Creators see the running one; closed ones are frozen snapshots."
      action={
        <button className="cf-button-primary" onClick={() => setEditing('new')}>
          New cycle
        </button>
      }
    >
      <table className="cf-table">
        <thead>
          <tr>
            <th>Id</th>
            <th>Start</th>
            <th>End</th>
            <th>Pool</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cycles.map(cycle => (
            <tr key={cycle.id}>
              <td>{cycle.id}</td>
              <td>{formatDate(cycle.start_at)}</td>
              <td>{formatDate(cycle.end_at)}</td>
              <td>{formatPool(cycle.pool_usdc)}</td>
              <td>
                <span className={`cf-badge cf-badge-${cycle.status}`}>{cycle.status}</span>
              </td>
              <td className="cf-row-actions">
                <button className="cf-button-secondary" aria-label={`Edit cycle ${cycle.id}`} onClick={() => setEditing(cycle)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
          {cycles.length === 0 && (
            <tr>
              <td colSpan={6} className="cf-empty">
                No cycles yet. Create the first one so creators have something to join.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {editing && (
        <CycleEditor
          cycle={editing === 'new' ? null : editing}
          cycles={cycles}
          onClose={() => setEditing(null)}
          onSubmit={action => {
            setEditing(null)
            ask(action)
          }}
          authenticatedFetch={authenticatedFetch}
        />
      )}
    </Section>
  )
}

const CycleEditor: FC<{
  cycle: Cycle | null
  cycles: Cycle[]
  authenticatedFetch: AuthenticatedFetch
  onClose: () => void
  onSubmit: (action: Action) => void
}> = ({ cycle, cycles, authenticatedFetch, onClose, onSubmit }) => {
  const closed = cycle?.status === 'closed'
  const id = cycle?.id ?? nextId(cycles)
  const [startAt, setStartAt] = useState(cycle ? toLocalInput(cycle.start_at) : '')
  const [endAt, setEndAt] = useState(cycle ? toLocalInput(cycle.end_at) : '')
  const [pool, setPool] = useState(cycle?.pool_usdc === null || cycle === null ? '' : String(cycle.pool_usdc))
  const [touched, setTouched] = useState(false)

  const start = startAt ? new Date(startAt) : null
  const end = endAt ? new Date(endAt) : null
  const poolValue = pool.trim() === '' ? null : Number(pool)
  const overlap =
    start && end
      ? cycles.find(other => other.id !== id && new Date(other.start_at) < end && new Date(other.end_at) > start)
      : undefined

  const errors = {
    start: !start ? 'Pick when the cycle starts' : null,
    end: !end ? 'Pick when the cycle ends' : start && end <= start ? 'Must be after the start' : overlap ? `Overlaps cycle ${overlap.id}` : null,
    pool: poolValue !== null && (!Number.isFinite(poolValue) || poolValue < 0) ? 'A non-negative amount, or empty' : null,
  }
  const valid = !errors.start && !errors.end && !errors.pool

  const submit = () => {
    setTouched(true)
    if (!valid || !start || !end) return
    const input = { start_at: start.toISOString(), end_at: end.toISOString(), pool_usdc: poolValue }
    const changes: Change[] = cycle
      ? [
          { label: 'Start', before: formatDate(cycle.start_at), after: formatDate(input.start_at) },
          { label: 'End', before: formatDate(cycle.end_at), after: formatDate(input.end_at) },
          { label: 'Pool', before: formatPool(cycle.pool_usdc), after: formatPool(poolValue) },
        ].filter(change => change.before !== change.after)
      : [
          { label: 'Id', after: String(id) },
          { label: 'Start', after: formatDate(input.start_at) },
          { label: 'End', after: formatDate(input.end_at) },
          { label: 'Pool', after: formatPool(poolValue) },
        ]
    onSubmit({
      title: cycle ? `Update cycle ${id}` : `Create cycle ${id}`,
      confirmLabel: cycle ? 'Update cycle' : 'Create cycle',
      changes,
      warning: !cycle && start <= new Date() ? 'This cycle starts in the past, so it is running the moment it is saved.' : undefined,
      success: cycle ? `Cycle ${id} updated` : `Cycle ${id} created`,
      run: () => putCycle(authenticatedFetch, id, input).then(() => undefined),
    })
  }

  return (
    <Dialog title={cycle ? `Edit cycle ${id}` : `New cycle ${id}`} onClose={onClose}>
      {closed && <div className="cf-warning">This cycle is closed: its dates are frozen, only the pool can change.</div>}
      <div className="cf-fields">
        <Field label="Start" error={touched ? errors.start : null}>
          <input
            aria-label="Cycle start"
            type="datetime-local"
            value={startAt}
            disabled={closed}
            autoFocus={!closed}
            onChange={e => setStartAt(e.target.value)}
          />
        </Field>
        <Field label="End" hint="Exclusive: the cycle closes at this moment." error={touched ? errors.end : null}>
          <input aria-label="Cycle end" type="datetime-local" value={endAt} disabled={closed} onChange={e => setEndAt(e.target.value)} />
        </Field>
        <Field label="Pool (USDC)" hint="Leave empty until the pool is decided." error={touched ? errors.pool : null}>
          <input
            aria-label="Cycle pool"
            value={pool}
            inputMode="decimal"
            placeholder="unset"
            autoFocus={closed}
            onChange={e => setPool(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </Field>
      </div>
      <div className="cf-modal-actions">
        <button className="cf-button-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="cf-button-primary" onClick={submit} disabled={touched && !valid}>
          Review
        </button>
      </div>
    </Dialog>
  )
}

/* ---------------------------------- terms ---------------------------------- */

const TermsSection: FC<SectionProps & { terms: Terms | null }> = ({ terms, authenticatedFetch, ask }) => {
  const [editing, setEditing] = useState(false)
  const nextVersion = (terms?.version ?? 0) + 1

  return (
    <Section
      title="Terms"
      hint="Creators accept the current version when they join. Publishing a new one makes every creator accept again."
      action={
        <button className="cf-button-primary" onClick={() => setEditing(true)}>
          Publish version {nextVersion}
        </button>
      }
    >
      {terms ? (
        <details className="cf-details">
          <summary>
            <span className="cf-badge cf-badge-running">v{terms.version}</span> {terms.title}{' '}
            <span className="cf-muted">published {formatDate(terms.published_at)}</span>
          </summary>
          <pre className="cf-pre">{terms.content}</pre>
        </details>
      ) : (
        <div className="cf-empty">No terms are published yet, so nobody can join.</div>
      )}
      {editing && (
        <TermsEditor
          current={terms}
          version={nextVersion}
          authenticatedFetch={authenticatedFetch}
          onClose={() => setEditing(false)}
          onSubmit={action => {
            setEditing(false)
            ask(action)
          }}
        />
      )}
    </Section>
  )
}

const TermsEditor: FC<{
  current: Terms | null
  version: number
  authenticatedFetch: AuthenticatedFetch
  onClose: () => void
  onSubmit: (action: Action) => void
}> = ({ current, version, authenticatedFetch, onClose, onSubmit }) => {
  const [title, setTitle] = useState(current?.title ?? '')
  const [content, setContent] = useState(current?.content ?? '')
  const [preview, setPreview] = useState(false)
  const [touched, setTouched] = useState(false)
  const errors = {
    title: title.trim() === '' ? 'Give the version a title' : null,
    content: content.trim() === '' ? 'The terms need their text' : null,
  }
  const valid = !errors.title && !errors.content
  const unchanged = current !== null && current.title === title.trim() && current.content === content

  const submit = () => {
    setTouched(true)
    if (!valid || unchanged) return
    onSubmit({
      title: `Publish terms version ${version}`,
      confirmLabel: 'Publish',
      changes: [
        { label: 'Version', before: current ? `v${current.version}` : undefined, after: `v${version}` },
        { label: 'Title', before: current?.title, after: title.trim() },
        { label: 'Length', before: current ? `${current.content.length} characters` : undefined, after: `${content.length} characters` },
      ],
      warning: current
        ? 'Every enrolled creator drops to "terms outdated" until they accept this version in Creator Hub. Their places earn nothing in the meantime.'
        : undefined,
      success: `Terms v${version} published`,
      run: () => publishTerms(authenticatedFetch, version, { title: title.trim(), content }).then(() => undefined),
    })
  }

  return (
    <Dialog title={`Publish terms version ${version}`} onClose={onClose} wide>
      <div className="cf-fields">
        <Field label="Title" error={touched ? errors.title : null}>
          <input aria-label="Terms title" value={title} maxLength={200} autoFocus onChange={e => setTitle(e.target.value)} />
        </Field>
        <Field
          label="Content"
          hint={`Markdown, ${content.length.toLocaleString()} characters. Prefilled with the current version to edit from.`}
          error={touched ? errors.content : null}
        >
          <div className="cf-segmented">
            <button className={preview ? '' : 'cf-segment-active'} onClick={() => setPreview(false)}>
              Write
            </button>
            <button className={preview ? 'cf-segment-active' : ''} onClick={() => setPreview(true)}>
              Preview
            </button>
          </div>
          {preview ? (
            <pre className="cf-pre cf-pre-tall">{content || 'Nothing to preview yet.'}</pre>
          ) : (
            <textarea aria-label="Terms content" value={content} rows={14} onChange={e => setContent(e.target.value)} />
          )}
        </Field>
      </div>
      {unchanged && <div className="cf-hint">Nothing changed from version {current?.version}.</div>}
      <div className="cf-modal-actions">
        <button className="cf-button-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="cf-button-primary" onClick={submit} disabled={unchanged || (touched && !valid)}>
          Review
        </button>
      </div>
    </Dialog>
  )
}

/* ---------------------------------- news ---------------------------------- */

const NewsSection: FC<SectionProps & { news: NewsItem[] }> = ({ news, authenticatedFetch, ask }) => {
  const [editing, setEditing] = useState<NewsItem | 'new' | null>(null)

  return (
    <Section
      title="News"
      hint="Shown on the Earn tab's Leaderboard, newest first."
      action={
        <button className="cf-button-primary" onClick={() => setEditing('new')}>
          New post
        </button>
      }
    >
      <ul className="cf-list">
        {news.map(item => (
          <li key={item.id}>
            <div className="cf-list-main">
              <strong>{item.title}</strong> <span className="cf-muted">{formatDate(item.published_at)}</span>
              <p>{item.body}</p>
            </div>
            <div className="cf-row-actions">
              <button className="cf-button-secondary" aria-label={`Edit news ${item.title}`} onClick={() => setEditing(item)}>
                Edit
              </button>
              <button
                className="cf-button-danger-outline"
                aria-label={`Delete news ${item.title}`}
                onClick={() =>
                  ask({
                    title: 'Delete post',
                    confirmLabel: 'Delete',
                    changes: [{ label: 'Post', before: item.title, after: 'removed' }],
                    danger: true,
                    success: 'Post deleted',
                    run: () => deleteNews(authenticatedFetch, item.id),
                  })
                }
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {news.length === 0 && <li className="cf-empty">No posts yet.</li>}
      </ul>
      {editing && (
        <NewsEditor
          item={editing === 'new' ? null : editing}
          id={editing === 'new' ? nextId(news) : editing.id}
          authenticatedFetch={authenticatedFetch}
          onClose={() => setEditing(null)}
          onSubmit={action => {
            setEditing(null)
            ask(action)
          }}
        />
      )}
    </Section>
  )
}

const NewsEditor: FC<{
  item: NewsItem | null
  id: number
  authenticatedFetch: AuthenticatedFetch
  onClose: () => void
  onSubmit: (action: Action) => void
}> = ({ item, id, authenticatedFetch, onClose, onSubmit }) => {
  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [touched, setTouched] = useState(false)
  const errors = {
    title: title.trim() === '' ? 'Give the post a title' : null,
    body: body.trim() === '' ? 'Write the post' : null,
  }
  const valid = !errors.title && !errors.body

  const submit = () => {
    setTouched(true)
    if (!valid) return
    const input = { title: title.trim(), body: body.trim() }
    onSubmit({
      title: item ? 'Update post' : 'Publish post',
      confirmLabel: item ? 'Update' : 'Publish',
      changes: [
        { label: 'Title', before: item?.title, after: input.title },
        { label: 'Body', before: item?.body, after: input.body },
      ].filter(change => change.before !== change.after),
      success: item ? 'Post updated' : 'Post published',
      run: () => putNews(authenticatedFetch, id, input).then(() => undefined),
    })
  }

  return (
    <Dialog title={item ? 'Edit post' : 'New post'} onClose={onClose}>
      <div className="cf-fields">
        <Field label="Title" error={touched ? errors.title : null}>
          <input aria-label="News title" value={title} maxLength={200} autoFocus onChange={e => setTitle(e.target.value)} />
        </Field>
        <Field label="Body" hint="Plain text, a few lines." error={touched ? errors.body : null}>
          <textarea aria-label="News body" value={body} rows={4} onChange={e => setBody(e.target.value)} />
        </Field>
      </div>
      <div className="cf-modal-actions">
        <button className="cf-button-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="cf-button-primary" onClick={submit} disabled={touched && !valid}>
          Review
        </button>
      </div>
    </Dialog>
  )
}

/* ---------------------------------- creators ---------------------------------- */

const CreatorsSection: FC<SectionProps & { creators: AdminCreator[]; excluded: Set<string> }> = ({
  creators,
  excluded,
  authenticatedFetch,
  ask,
}) => {
  const [filter, setFilter] = useState('')
  const [excluding, setExcluding] = useState<AdminCreator | null>(null)
  const needle = filter.trim().toLowerCase()
  const shown = needle
    ? creators.filter(creator =>
        [creator.address, creator.first_name, creator.last_name, creator.email].some(field =>
          field.toLowerCase().includes(needle)
        )
      )
    : creators

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([creatorsToCsv(shown)], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `creator-fund-creators-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const toggleStatus = (creator: AdminCreator) => {
    const suspend = creator.status === 'active'
    ask({
      title: suspend ? 'Suspend creator' : 'Reinstate creator',
      confirmLabel: suspend ? 'Suspend' : 'Reinstate',
      changes: [
        { label: 'Creator', after: `${creator.first_name} ${creator.last_name} (${shortAddress(creator.address)})` },
        { label: 'Status', before: creator.status, after: suspend ? 'suspended' : 'active' },
      ],
      warning: suspend
        ? 'Their places leave the programme and they see "suspended" in Creator Hub until reinstated.'
        : 'Their places are back in the programme from the next sweep.',
      danger: suspend,
      success: suspend ? 'Creator suspended' : 'Creator reinstated',
      run: () => setCreatorStatus(authenticatedFetch, creator.address, suspend ? 'suspended' : 'active').then(() => undefined),
    })
  }

  return (
    <Section
      title={`Creators (${creators.length})`}
      hint="Everyone who joined. Names and emails never leave this page."
      action={
        <button className="cf-button-secondary" onClick={exportCsv} disabled={shown.length === 0}>
          Export CSV{needle ? ` (${shown.length})` : ''}
        </button>
      }
    >
      <div className="cf-toolbar">
        <input
          aria-label="Filter creators"
          placeholder="Filter by wallet, name or email"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>
      <table className="cf-table">
        <thead>
          <tr>
            <th>Wallet</th>
            <th>Name</th>
            <th>Email</th>
            <th>Joined</th>
            <th>Terms</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.map(creator => (
            <tr key={creator.address}>
              <td>
                <code title={creator.address}>{shortAddress(creator.address)}</code>
              </td>
              <td>
                {creator.first_name} {creator.last_name}
              </td>
              <td>
                {creator.email}
                {creator.email_verified_at && (
                  <span className="cf-muted" title={`Verified ${formatDate(creator.email_verified_at)}`}>
                    {' '}
                    ✓
                  </span>
                )}
              </td>
              <td>{formatDate(creator.enrolled_at)}</td>
              <td>{creator.terms_version === null ? '—' : `v${creator.terms_version}`}</td>
              <td>
                <span className={`cf-badge cf-badge-${creator.status}`}>{creator.status}</span>
                {excluded.has(creator.address) && <span className="cf-badge cf-badge-excluded">excluded</span>}
              </td>
              <td className="cf-row-actions">
                <button
                  className={creator.status === 'active' ? 'cf-button-danger-outline' : 'cf-button-secondary'}
                  aria-label={`${creator.status === 'active' ? 'Suspend' : 'Reinstate'} ${creator.address}`}
                  onClick={() => toggleStatus(creator)}
                >
                  {creator.status === 'active' ? 'Suspend' : 'Reinstate'}
                </button>
                {!excluded.has(creator.address) && (
                  <button
                    className="cf-button-danger-outline"
                    aria-label={`Exclude ${creator.address}`}
                    onClick={() => setExcluding(creator)}
                  >
                    Exclude
                  </button>
                )}
              </td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td colSpan={7} className="cf-empty">
                {creators.length === 0 ? 'Nobody has joined yet.' : 'No creator matches the filter.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {excluding && (
        <ExcludeDialog
          title="Exclude creator"
          subject={`${excluding.first_name} ${excluding.last_name} (${shortAddress(excluding.address)})`}
          reasons={CREATOR_REASONS}
          onClose={() => setExcluding(null)}
          onSubmit={(reason, note) => {
            const creator = excluding
            setExcluding(null)
            ask({
              title: 'Exclude creator',
              confirmLabel: 'Exclude',
              changes: [
                { label: 'Creator', after: `${creator.first_name} ${creator.last_name} (${shortAddress(creator.address)})` },
                { label: 'Reason', after: reason },
                ...(note ? [{ label: 'Note', after: note }] : []),
              ],
              warning: 'They cannot join, and their places leave the programme until the exclusion is lifted.',
              danger: true,
              success: 'Creator excluded',
              run: () => excludeCreator(authenticatedFetch, creator.address, { reason, note }),
            })
          }}
        />
      )}
    </Section>
  )
}

/* ---------------------------------- exclusions ---------------------------------- */

const ExclusionsSection: FC<SectionProps & { exclusions: Exclusions }> = ({ exclusions, authenticatedFetch, ask }) => (
  <Section title="Exclusions" hint="Lifting one puts the place or creator back from the next sweep.">
    <h3>Places</h3>
    <ul className="cf-list">
      {exclusions.places.map(exclusion => (
        <li key={exclusion.place_id}>
          <div className="cf-list-main">
            <code>{exclusion.place_id}</code> <span className="cf-badge cf-badge-excluded">{exclusion.reason}</span>
            {exclusion.note && <p>{exclusion.note}</p>}
            <span className="cf-muted">since {formatDate(exclusion.added_at)}</span>
          </div>
          <button
            className="cf-button-secondary"
            aria-label={`Lift place exclusion ${exclusion.place_id}`}
            onClick={() =>
              ask({
                title: 'Lift place exclusion',
                confirmLabel: 'Lift',
                changes: [{ label: 'Place', before: exclusion.reason, after: 'back in the programme' }],
                success: 'Place exclusion lifted',
                run: () => includePlace(authenticatedFetch, exclusion.place_id),
              })
            }
          >
            Lift
          </button>
        </li>
      ))}
      {exclusions.places.length === 0 && <li className="cf-empty">No excluded places.</li>}
    </ul>
    <h3>Creators</h3>
    <ul className="cf-list">
      {exclusions.creators.map(exclusion => (
        <li key={exclusion.address}>
          <div className="cf-list-main">
            <code title={exclusion.address}>{shortAddress(exclusion.address)}</code>{' '}
            <span className="cf-badge cf-badge-excluded">{exclusion.reason}</span>
            {exclusion.note && <p>{exclusion.note}</p>}
            <span className="cf-muted">since {formatDate(exclusion.added_at)}</span>
          </div>
          <button
            className="cf-button-secondary"
            aria-label={`Lift creator exclusion ${exclusion.address}`}
            onClick={() =>
              ask({
                title: 'Lift creator exclusion',
                confirmLabel: 'Lift',
                changes: [{ label: 'Creator', before: exclusion.reason, after: 'eligible again' }],
                success: 'Creator exclusion lifted',
                run: () => includeCreator(authenticatedFetch, exclusion.address),
              })
            }
          >
            Lift
          </button>
        </li>
      ))}
      {exclusions.creators.length === 0 && <li className="cf-empty">No excluded creators.</li>}
    </ul>
  </Section>
)

/* ---------------------------------- cycle snapshot ---------------------------------- */

const CyclePlacesSection: FC<SectionProps & { cycles: Cycle[]; excluded: Set<string> }> = ({
  cycles,
  excluded,
  authenticatedFetch,
  ask,
}) => {
  const latest = cycles.find(cycle => cycle.status === 'running') ?? cycles[cycles.length - 1]
  const [cycleId, setCycleId] = useState<number | null>(latest?.id ?? null)
  // Keyed by cycle, so switching cycles shows "Loading…" without a reset inside the effect.
  const [loaded, setLoaded] = useState<{ cycleId: number; places?: AdminCyclePlace[]; error?: string } | null>(null)
  const [excluding, setExcluding] = useState<AdminCyclePlace | null>(null)
  const places = loaded?.cycleId === cycleId ? loaded.places : undefined
  const error = loaded?.cycleId === cycleId ? loaded.error : undefined

  useEffect(() => {
    if (cycleId === null) return
    let cancelled = false
    getCyclePlaces(authenticatedFetch, cycleId)
      .then(rows => ({ cycleId, places: rows }))
      .catch((err: unknown) => ({ cycleId, error: errorMessage(err, 'Failed to load the snapshot') }))
      .then(result => {
        if (!cancelled) setLoaded(result)
      })
    return () => {
      cancelled = true
    }
  }, [authenticatedFetch, cycleId])

  if (cycles.length === 0) return null

  return (
    <Section
      title={places ? `Cycle snapshot (${places.length} place${places.length === 1 ? '' : 's'})` : 'Cycle snapshot'}
      hint="Every owned place as the join and the sweep recorded it. Collaborator places never earn, so they are not here. Exclude a place from its row."
    >
      <div className="cf-toolbar">
        <select aria-label="Snapshot cycle" value={cycleId ?? ''} onChange={e => setCycleId(Number(e.target.value))}>
          {cycles.map(cycle => (
            <option key={cycle.id} value={cycle.id}>
              Cycle {cycle.id} ({cycle.status}): {formatDate(cycle.start_at)} → {formatDate(cycle.end_at)}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="cf-error">{error}</div>}
      {!places && !error && <div className="cf-loading">Loading…</div>}
      {places && (
        <table className="cf-table">
          <thead>
            <tr>
              <th>Place</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Seen</th>
              <th>Removed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {places.map(place => (
              <tr key={`${place.place_id}:${place.address}`} className={place.removed_at ? 'cf-row-muted' : ''}>
                <td>
                  <strong>{place.title ?? place.place_id}</strong>
                  <br />
                  <span className="cf-muted">{place.world ? place.world_name : place.base_position}</span>
                </td>
                <td>
                  <code title={place.address}>{shortAddress(place.address)}</code>
                </td>
                <td>
                  <span className={`cf-badge cf-badge-${place.status}`}>{place.status.replace('_', ' ')}</span>
                  {place.reasons.length > 0 && <span className="cf-muted"> {place.reasons.join(', ')}</span>}
                </td>
                <td>{formatDate(place.first_seen_at)}</td>
                <td>{formatDate(place.removed_at)}</td>
                <td className="cf-row-actions">
                  {excluded.has(place.place_id) ? (
                    <span className="cf-badge cf-badge-excluded">excluded</span>
                  ) : (
                    <button
                      className="cf-button-danger-outline"
                      aria-label={`Exclude place ${place.place_id}`}
                      onClick={() => setExcluding(place)}
                    >
                      Exclude
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {places.length === 0 && (
              <tr>
                <td colSpan={6} className="cf-empty">
                  No places recorded for this cycle yet. The sweep records them hourly, or run it below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {excluding && (
        <ExcludeDialog
          title="Exclude place"
          subject={excluding.title ?? excluding.place_id}
          reasons={PLACE_REASONS}
          onClose={() => setExcluding(null)}
          onSubmit={(reason, note) => {
            const place = excluding
            setExcluding(null)
            ask({
              title: 'Exclude place',
              confirmLabel: 'Exclude',
              changes: [
                { label: 'Place', after: `${place.title ?? place.place_id} (${place.world ? place.world_name : place.base_position})` },
                { label: 'Reason', after: reason },
                ...(note ? [{ label: 'Note', after: note }] : []),
              ],
              warning: 'The place leaves the programme for every owner until the exclusion is lifted.',
              danger: true,
              success: 'Place excluded',
              run: () => excludePlace(authenticatedFetch, place.place_id, { reason, note }),
            })
          }}
        />
      )}
    </Section>
  )
}

/* ---------------------------------- sweep ---------------------------------- */

/** The sweep reports what it changed, not how many places exist; a quiet run reads as a quiet run. */
function describeSweep(result: SweepResult): string {
  if (result.status === 'skipped') {
    return `Skipped: ${result.reason === 'locked' ? 'another run holds the lock' : 'no cycle is running'}`
  }
  const changes = result.inserted + result.updated + result.removed
  if (changes === 0 && result.failures === 0) {
    return `Checked ${result.creators} creator${result.creators === 1 ? '' : 's'}: the snapshot already matched, nothing to change. The places themselves are in the cycle snapshot above.`
  }
  return `Checked ${result.creators} creator${result.creators === 1 ? '' : 's'}: ${result.inserted} place${result.inserted === 1 ? '' : 's'} added, ${result.updated} updated, ${result.removed} removed${result.failures ? `, ${result.failures} creator${result.failures === 1 ? '' : 's'} could not be checked` : ''}.`
}

const SweepSection: FC<SectionProps> = ({ authenticatedFetch, ask }) => {
  const [result, setResult] = useState<SweepResult | null>(null)

  return (
    <Section
      title="Sweep"
      hint="Records every enrolled creator's places for the running cycle. Runs hourly on its own; run it now after publishing terms or changing exclusions."
      action={
        <button
          className="cf-button-secondary"
          onClick={() =>
            ask({
              title: 'Run the sweep now',
              confirmLabel: 'Run sweep',
              changes: [{ label: 'Scope', after: 'every enrolled creator, running cycle only' }],
              warning: 'This can take a minute with many creators.',
              success: 'Sweep finished',
              run: () => runSweep(authenticatedFetch).then(setResult),
            })
          }
        >
          Run sweep
        </button>
      }
    >
      {result ? <p className="cf-muted">{describeSweep(result)}</p> : <p className="cf-muted">No run from this page yet.</p>}
    </Section>
  )
}

/* ---------------------------------- shared dialogs ---------------------------------- */

function ExcludeDialog<R extends string>({
  title,
  subject,
  reasons,
  onSubmit,
  onClose,
}: {
  title: string
  subject: string
  reasons: ReadonlyArray<{ value: R; label: string; hint: string }>
  onSubmit: (reason: R, note: string | null) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState<R>(reasons[0].value)
  const [note, setNote] = useState('')

  return (
    <Dialog title={title} onClose={onClose}>
      <p className="cf-modal-subject">{subject}</p>
      <div className="cf-choices" role="radiogroup" aria-label="Exclusion reason">
        {reasons.map(option => (
          <label key={option.value} className={`cf-choice ${reason === option.value ? 'cf-choice-active' : ''}`}>
            <input type="radio" name="reason" value={option.value} checked={reason === option.value} onChange={() => setReason(option.value)} />
            <span>
              <strong>{option.label}</strong>
              <span className="cf-field-hint">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <Field label="Note" hint="For other admins only. Never shown to the creator.">
        <input
          aria-label="Exclusion note"
          placeholder="Why, and who decided"
          value={note}
          maxLength={500}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSubmit(reason, note.trim() === '' ? null : note.trim())}
        />
      </Field>
      <div className="cf-modal-actions">
        <button className="cf-button-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="cf-button-danger" onClick={() => onSubmit(reason, note.trim() === '' ? null : note.trim())}>
          Review
        </button>
      </div>
    </Dialog>
  )
}

const ReviewDialog: FC<{
  state: Exclude<ReviewState, { status: 'idle' }>
  onConfirm: () => void
  onCancel: () => void
}> = ({ state, onConfirm, onCancel }) => {
  const { action } = state
  const saving = state.status === 'saving'

  return (
    <Dialog title={action.title} onClose={saving ? () => undefined : onCancel}>
      <dl className="cf-changes">
        {action.changes.map(change => (
          <div key={change.label} className="cf-change">
            <dt>{change.label}</dt>
            <dd>
              {change.before !== undefined && change.before !== change.after && (
                <>
                  <span className="cf-change-before">{change.before}</span>
                  <span className="cf-change-arrow">→</span>
                </>
              )}
              <span className="cf-change-after">{change.after}</span>
            </dd>
          </div>
        ))}
      </dl>
      {action.warning && <div className="cf-warning">{action.warning}</div>}
      {state.status === 'error' && <div className="cf-error">{state.message}</div>}
      <div className="cf-modal-actions">
        <button className="cf-button-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className={action.danger ? 'cf-button-danger' : 'cf-button-primary'} onClick={onConfirm} disabled={saving} autoFocus>
          {saving ? 'Saving…' : action.confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
