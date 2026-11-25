import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlacesPage } from './PlacesPage'
import {
  createPlace,
  fetchAllPlaces,
  fetchAllTags,
  fetchBackofficePlaces,
  updatePlace,
} from '../features/places/placesApi'
import { fetchScenesForPlaces, searchScenes } from '../features/scenes/api'
import { downloadCsv } from '../features/scenes/csv'
import type { Place } from '../features/places/types'
import type { SceneInfo } from '../features/scenes/model'
import { useAuth } from '../contexts/auth'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { isDevMode } from '../utils/devIdentity'

vi.mock('../features/places/placesApi', () => ({
  createPlace: vi.fn(),
  fetchAllPlaces: vi.fn(),
  fetchAllTags: vi.fn(),
  fetchBackofficePlaces: vi.fn(),
  updatePlace: vi.fn(),
}))
vi.mock('../features/scenes/api', () => ({
  SEARCH_PAGE_SIZE: 100,
  fetchScenesForPlaces: vi.fn(),
  searchScenes: vi.fn(),
}))
vi.mock('../features/scenes/csv', async importOriginal => ({
  ...(await importOriginal<typeof import('../features/scenes/csv')>()),
  downloadCsv: vi.fn(),
}))
vi.mock('../contexts/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: vi.fn() }))
vi.mock('../utils/devIdentity', () => ({ isDevMode: vi.fn() }))

const mockCreatePlace = vi.mocked(createPlace)
const mockFetchAllPlaces = vi.mocked(fetchAllPlaces)
const mockFetchAllTags = vi.mocked(fetchAllTags)
const mockFetchBackofficePlaces = vi.mocked(fetchBackofficePlaces)
const mockUpdatePlace = vi.mocked(updatePlace)
const mockFetchScenesForPlaces = vi.mocked(fetchScenesForPlaces)
const mockSearchScenes = vi.mocked(searchScenes)
const mockDownloadCsv = vi.mocked(downloadCsv)
const mockUseAuth = vi.mocked(useAuth)
const mockUseAuthenticatedFetch = vi.mocked(useAuthenticatedFetch)
const mockIsDevMode = vi.mocked(isDevMode)

const authenticatedFetch = vi.fn()

function place(overrides: Partial<Place>): Place {
  return {
    id: 'p',
    type: 'scene',
    name: null,
    basePosition: null,
    worldName: null,
    sceneId: null,
    groupId: null,
    groupName: null,
    groupColor: null,
    tags: [],
    positions: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function scene(overrides: Partial<SceneInfo> & Pick<SceneInfo, 'key' | 'kind' | 'title'>): SceneInfo {
  return {
    description: null,
    thumbnail: null,
    basePosition: null,
    positions: [],
    worldName: null,
    owner: null,
    userCount: 0,
    contentRating: null,
    categories: [],
    ...overrides,
  }
}

const PLAZA_PLACE = place({
  id: 'p-plaza',
  basePosition: '-3,-2',
  positions: ['-3,-2'],
  tags: ['allowed_ios', 'featured'],
})
const BOEDO_PLACE = place({ id: 'p-boedo', type: 'world', worldName: 'boedo.dcl.eth', tags: ['banned_ios'] })

const PLAZA = scene({
  key: 'genesis:-3,-2',
  kind: 'genesis',
  title: 'Genesis Plaza',
  basePosition: '-3,-2',
  positions: ['-3,-2'],
  userCount: 8,
})
const BOEDO = scene({ key: 'world:boedo.dcl.eth', kind: 'world', title: 'Counter-Strike', worldName: 'boedo.dcl.eth' })
const MUSEUM = scene({
  key: 'genesis:13,75',
  kind: 'genesis',
  title: 'DCL Museum',
  basePosition: '13,75',
  positions: ['13,75', '13,76'],
})

function signedIn(isSignedIn: boolean) {
  mockUseAuth.mockReturnValue({ isSignedIn } as ReturnType<typeof useAuth>)
}

function iosGroup(title: string) {
  return within(screen.getByRole('group', { name: `iOS status for ${title}` }))
}

function tagChip(name: string | RegExp) {
  return within(screen.getByRole('group', { name: 'Filter by tag' })).getByRole('button', { name })
}

describe('PlacesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthenticatedFetch.mockReturnValue(authenticatedFetch)
    mockIsDevMode.mockReturnValue(false)
    signedIn(true)
    mockFetchBackofficePlaces.mockResolvedValue([PLAZA_PLACE, BOEDO_PLACE])
    mockFetchAllPlaces.mockResolvedValue([])
    mockFetchAllTags.mockResolvedValue([{ id: 't1', name: 'featured', createdAt: 0 }])
    mockFetchScenesForPlaces.mockResolvedValue({ scenes: [PLAZA, BOEDO], complete: true })
    mockSearchScenes.mockResolvedValue({ scenes: [MUSEUM, PLAZA], total: 2 })
  })

  it('lists the tagged places with their titles, iOS status and featured state', async () => {
    render(<PlacesPage />)

    expect(await screen.findByText('Genesis Plaza')).toBeTruthy()
    expect(screen.getByText('Counter-Strike')).toBeTruthy()
    expect(iosGroup('Genesis Plaza').getByRole('button', { name: 'Allowed' }).getAttribute('aria-pressed')).toBe('true')
    expect(iosGroup('Counter-Strike').getByRole('button', { name: 'Banned' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Featured: Genesis Plaza' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Featured: Counter-Strike' }).getAttribute('aria-pressed')).toBe('false')
  })

  // What the Curation tab was for: every tag at a glance, with how many places carry it
  it('lists every tag with its count, unused ones included', async () => {
    mockFetchAllTags.mockResolvedValue([
      { id: 't1', name: 'featured', createdAt: 0 },
      { id: 't2', name: 'rod', createdAt: 0 },
    ])
    render(<PlacesPage />)
    await screen.findByText('Genesis Plaza')

    const chips = within(screen.getByRole('group', { name: 'Filter by tag' }))
      .getAllByRole('button')
      .map(b => b.textContent)
    expect(chips).toEqual(['banned0', 'allowed_ios1', 'banned_ios1', 'featured1', 'ftue0', 'rod0', 'No iOS status'])
  })

  // The point of the tab: find any scene, even one nobody tagged yet, and allow it in one click
  it('searches every scene and allows an untagged one on iOS', async () => {
    const user = userEvent.setup()
    mockCreatePlace.mockResolvedValue(
      place({ id: 'p-museum', basePosition: '13,75', positions: ['13,75', '13,76'], tags: ['allowed_ios'] })
    )
    render(<PlacesPage />)
    await screen.findByText('Genesis Plaza')

    await user.type(screen.getByRole('searchbox', { name: 'Search places' }), 'museum')

    expect(await screen.findByText('DCL Museum')).toBeTruthy()
    expect(mockSearchScenes).toHaveBeenCalledWith('museum', 'all', 0, expect.any(AbortSignal))

    await user.click(iosGroup('DCL Museum').getByRole('button', { name: 'Allowed' }))

    expect(mockCreatePlace).toHaveBeenCalledWith(authenticatedFetch, {
      type: 'scene',
      basePosition: '13,75',
      positions: ['13,75', '13,76'],
      name: 'DCL Museum',
      tags: ['allowed_ios'],
    })
    await waitFor(() =>
      expect(iosGroup('DCL Museum').getByRole('button', { name: 'Allowed' }).getAttribute('aria-pressed')).toBe('true')
    )
  })

  // The iOS block list hides casinos and A/R ratings on its own; allowed_ios keeps one listed
  it('marks scenes the iOS block list hides on its own, unless they are allowed', async () => {
    const user = userEvent.setup()
    mockSearchScenes.mockResolvedValue({
      scenes: [
        { ...MUSEUM, contentRating: 'A' },
        { ...PLAZA, categories: ['casino'] },
      ],
      total: 2,
    })
    render(<PlacesPage />)
    await screen.findByText('Genesis Plaza')

    await user.type(screen.getByRole('searchbox', { name: 'Search places' }), 'museum')

    expect(await screen.findByText('Blocked on iOS: Rated A (adult)')).toBeTruthy()
    expect(screen.getByText('Casino, listed on iOS because it is Allowed')).toBeTruthy()
    expect(screen.queryByText('Blocked on iOS: Casino')).toBeNull()
  })

  // The iOS app lists anything with allowed_ios, so banning must take it off in the same write
  it('bans an allowed scene by swapping its iOS tag and keeping the rest', async () => {
    const user = userEvent.setup()
    mockUpdatePlace.mockResolvedValue({ ...PLAZA_PLACE, tags: ['featured', 'banned_ios'] })
    render(<PlacesPage />)
    await screen.findByText('Genesis Plaza')

    await user.click(iosGroup('Genesis Plaza').getByRole('button', { name: 'Banned' }))

    expect(mockUpdatePlace).toHaveBeenCalledWith(authenticatedFetch, 'p-plaza', { tags: ['featured', 'banned_ios'] })
    expect(mockCreatePlace).not.toHaveBeenCalled()
  })

  it('filters by one tag at a time', async () => {
    const user = userEvent.setup()
    render(<PlacesPage />)
    await screen.findByText('Genesis Plaza')

    await user.click(tagChip(/^allowed_ios/))
    expect(screen.getByText('Genesis Plaza')).toBeTruthy()
    expect(screen.queryByText('Counter-Strike')).toBeNull()

    // Picking another tag replaces the first instead of narrowing further
    await user.click(tagChip(/^banned_ios/))
    expect(screen.queryByText('Genesis Plaza')).toBeNull()
    expect(screen.getByText('Counter-Strike')).toBeTruthy()
    expect(tagChip(/^allowed_ios/).getAttribute('aria-pressed')).toBe('false')

    await user.click(tagChip(/^banned_ios/))
    expect(screen.getByText('Genesis Plaza')).toBeTruthy()
  })

  it('features a place from its row and warns when iOS has not allowed it', async () => {
    const user = userEvent.setup()
    mockUpdatePlace.mockResolvedValue({ ...BOEDO_PLACE, tags: ['banned_ios', 'featured'] })
    render(<PlacesPage />)
    await screen.findByText('Genesis Plaza')
    expect(screen.queryByText('Featured but not allowed on iOS')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Featured: Counter-Strike' }))

    expect(mockUpdatePlace).toHaveBeenCalledWith(authenticatedFetch, 'p-boedo', { tags: ['banned_ios', 'featured'] })
    expect(await screen.findByText('Featured but not allowed on iOS')).toBeTruthy()
  })

  it('bans a place on Android and iOS from its row, keeping its iOS choice', async () => {
    const user = userEvent.setup()
    mockUpdatePlace.mockResolvedValue({ ...PLAZA_PLACE, tags: ['allowed_ios', 'featured', 'banned'] })
    render(<PlacesPage />)
    await screen.findByText('Genesis Plaza')
    const ban = () => screen.getByRole('button', { name: 'Banned on Android and iOS: Genesis Plaza' })
    expect(ban().getAttribute('aria-pressed')).toBe('false')

    await user.click(ban())

    expect(mockUpdatePlace).toHaveBeenCalledWith(authenticatedFetch, 'p-plaza', {
      tags: ['allowed_ios', 'featured', 'banned'],
    })
    await waitFor(() => expect(ban().getAttribute('aria-pressed')).toBe('true'))
    expect(iosGroup('Genesis Plaza').getByRole('button', { name: 'Allowed' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Remove banned from Genesis Plaza' })).toBeNull()
  })

  // Replaces the Curation tab's "Export iOS CSV": same columns and file name
  it('exports the places shown, named after the tag filter', async () => {
    const user = userEvent.setup()
    render(<PlacesPage />)
    await screen.findByText('Genesis Plaza')

    await user.click(tagChip(/^allowed_ios/))
    await user.click(screen.getByRole('button', { name: 'Export CSV (1)' }))

    const [csv, filename] = mockDownloadCsv.mock.calls[0]
    expect(filename).toMatch(/^allowed_ios_places_\d{4}-\d{2}-\d{2}\.csv$/)
    expect(csv.split('\n')).toEqual([
      'Title,Description,Owner,Contact,Deeplink,Type,Tags',
      'Genesis Plaza,,,,"decentraland://open?position=-3,-2",scene,"allowed_ios, featured"',
    ])
  })

  // Working through "Not set" results, a scene just reviewed must not vanish under the cursor
  it('keeps an edited row on screen until the filters change', async () => {
    const user = userEvent.setup()
    mockCreatePlace.mockResolvedValue(
      place({ id: 'p-museum', basePosition: '13,75', positions: ['13,75', '13,76'], tags: ['banned_ios'] })
    )
    render(<PlacesPage />)
    await screen.findByText('Genesis Plaza')
    await user.type(screen.getByRole('searchbox', { name: 'Search places' }), 'museum')
    await user.click(tagChip('No iOS status'))
    await screen.findByText('DCL Museum')
    expect(screen.queryByText('Genesis Plaza')).toBeNull()

    await user.click(iosGroup('DCL Museum').getByRole('button', { name: 'Banned' }))

    await waitFor(() =>
      expect(iosGroup('DCL Museum').getByRole('button', { name: 'Banned' }).getAttribute('aria-pressed')).toBe('true')
    )
    expect(screen.getByText('DCL Museum')).toBeTruthy()
  })

  it('adds a tag to every selected scene after confirming', async () => {
    const user = userEvent.setup()
    mockUpdatePlace.mockImplementation(async (_fetch, id, input) =>
      ({ ...(id === 'p-plaza' ? PLAZA_PLACE : BOEDO_PLACE), tags: input.tags ?? [] })
    )
    render(<PlacesPage />)
    await screen.findByText('Genesis Plaza')

    await user.click(screen.getByRole('checkbox', { name: 'Select Genesis Plaza' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Counter-Strike' }))
    await user.type(screen.getByRole('combobox', { name: 'Tag to add to selected' }), 'Curated')
    await user.click(screen.getByRole('button', { name: 'Add tag' }))

    expect(screen.getByText('Add “curated” to 2 places?')).toBeTruthy()
    expect(mockUpdatePlace).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('2 places saved')).toBeTruthy()
    expect(mockUpdatePlace).toHaveBeenCalledWith(authenticatedFetch, 'p-plaza', {
      tags: ['allowed_ios', 'featured', 'curated'],
    })
    expect(mockUpdatePlace).toHaveBeenCalledWith(authenticatedFetch, 'p-boedo', { tags: ['banned_ios', 'curated'] })
  })

  it('shows why a save failed on the row', async () => {
    const user = userEvent.setup()
    mockUpdatePlace.mockRejectedValue(new Error('Forbidden: User not in allowed list'))
    render(<PlacesPage />)
    await screen.findByText('Genesis Plaza')

    await user.click(iosGroup('Genesis Plaza').getByRole('button', { name: 'Banned' }))

    expect(await screen.findByText('Forbidden: User not in allowed list')).toBeTruthy()
    expect(iosGroup('Genesis Plaza').getByRole('button', { name: 'Allowed' }).getAttribute('aria-pressed')).toBe('true')
  })

  // A signed-out visitor can look but must not be able to change what the iOS app lists
  it('reads the public list and disables tagging when signed out', async () => {
    signedIn(false)
    mockFetchAllPlaces.mockResolvedValue([{ ...PLAZA_PLACE, isBanned: false, banSceneId: null }])
    render(<PlacesPage />)

    expect(await screen.findByText('Genesis Plaza')).toBeTruthy()
    expect(screen.getByText('Sign in with an allowed wallet to tag places.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Featured: Genesis Plaza' })).toHaveProperty('disabled', true)
    expect(mockFetchBackofficePlaces).not.toHaveBeenCalled()
    expect(iosGroup('Genesis Plaza').getByRole('button', { name: 'Banned' })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: 'Add tag to Genesis Plaza' })).toBeNull()
  })
})
