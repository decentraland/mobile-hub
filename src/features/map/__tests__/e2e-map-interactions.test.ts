/**
 * E2E Test Cases for Map Interactions
 *
 * These tests can be run using Claude's Chrome extension automation.
 * Run with: "Test the map interactions using the Chrome extension"
 *
 * Prerequisites:
 * - App running on localhost:5173
 * - Chrome extension connected
 */

export interface TestCase {
  name: string;
  description: string;
  steps: string[];
  expectedResults: string[];
}

export const mapInteractionTests: TestCase[] = [
  // === SCENE DETAIL SIDEBAR TESTS ===
  {
    name: 'Click on parcel with deployed scene',
    description: 'Clicking on a parcel with a scene should show scene details',
    steps: [
      'Navigate to localhost:5173',
      'Click on parcel 0,0 (Genesis Plaza)',
    ],
    expectedResults: [
      'SceneDetailSidebar opens',
      'Header shows "Scene Details"',
      'Scene name is displayed',
      'Thumbnail is shown (if available)',
      'Parcels field shows coordinates',
    ],
  },
  {
    name: 'Click on empty parcel (no scene)',
    description: 'Clicking on an empty parcel should show parcel details',
    steps: [
      'Navigate to localhost:5173',
      'Click on parcel 150,150 (likely empty)',
    ],
    expectedResults: [
      'SceneDetailSidebar opens',
      'Header shows "Parcel Details"',
      '"No scene deployed" message is displayed',
      'Parcels field shows "150,150"',
    ],
  },
  {
    name: 'Click on different parcels updates sidebar',
    description: 'Clicking on a new parcel should update the sidebar content',
    steps: [
      'Click on parcel 0,0',
      'Wait for sidebar to load',
      'Click on parcel 10,10',
    ],
    expectedResults: [
      'Sidebar content updates to show new parcel info',
      'Loading state is shown briefly',
      'New scene info is displayed',
    ],
  },

  // === GROUP MANAGEMENT TESTS ===
  {
    name: 'Layers button opens Groups sidebar',
    description: 'Clicking the layers button should open the groups sidebar',
    steps: [
      'Navigate to localhost:5173',
      'Click the layers button (bottom left)',
    ],
    expectedResults: [
      'GroupsSidebar opens',
      'Header shows "Scene Groups"',
      '"Select Parcels" button is visible',
    ],
  },
  {
    name: 'Select Parcels mode',
    description: 'Clicking Select Parcels should enable parcel selection',
    steps: [
      'Open Groups sidebar via layers button',
      'Click "Select Parcels" button',
      'Click on parcel 5,5',
      'Click on parcel 6,6',
    ],
    expectedResults: [
      'Selection overlay appears on map',
      'Clicked parcels are highlighted',
      'Footer shows "2 parcels selected"',
      '"Clear" and "Create Group" buttons appear',
    ],
  },
  {
    name: 'Create Group flow',
    description: 'Creating a new group from selected parcels',
    steps: [
      'Open Groups sidebar',
      'Click "Select Parcels"',
      'Select parcels 5,5 and 6,6',
      'Click "Create Group"',
      'Enter name "Test Group"',
      'Select a color',
      'Click "Create Group" button',
    ],
    expectedResults: [
      'Group form appears',
      'Selected parcels count is shown',
      'Color picker shows available colors',
      'Group is created successfully',
      'Sidebar returns to list view',
      'New group appears in list',
    ],
  },
  {
    name: 'Edit Group - add parcels',
    description: 'Editing a group should allow adding new parcels',
    steps: [
      'Open Groups sidebar',
      'Click Edit on an existing group',
      'Click on a new parcel on the map',
      'Click "Save Changes"',
    ],
    expectedResults: [
      'Edit form opens',
      'Existing parcels are shown',
      'Clicking map adds parcels to selection',
      'Parcel count increases',
      'Save updates the group',
    ],
  },

  // === ADD/REMOVE FROM GROUP TESTS ===
  {
    name: 'Add scene to existing group',
    description: 'Adding a scene to an existing group via SceneDetailSidebar',
    steps: [
      'Click on a parcel not in any group',
      'In the dropdown, select an existing group',
      'Click "Add to Group"',
    ],
    expectedResults: [
      'Sidebar stays open',
      'Group badge appears showing the group',
      'Dropdown shows "Already in a group"',
    ],
  },
  {
    name: 'Remove scene from group',
    description: 'Removing a scene from a group via SceneDetailSidebar',
    steps: [
      'Click on a parcel that belongs to a group',
      'Click "Remove from Group" button',
    ],
    expectedResults: [
      'Sidebar stays open',
      'Group badge disappears',
      'Add to Group dropdown becomes available',
    ],
  },
  {
    name: 'Create new group from scene dropdown',
    description: 'Creating a new group from the scene detail sidebar',
    steps: [
      'Click on a multi-parcel scene (not in a group)',
      'Ensure "Create new group..." is selected in dropdown',
      'Click "Create Group"',
    ],
    expectedResults: [
      'GroupsSidebar opens in create mode',
      'Scene parcels are pre-selected',
      'Group form is shown directly (not list)',
    ],
  },

  // === PARCEL CONSTRAINT TESTS ===
  {
    name: 'Parcel can only be in one group',
    description: 'A parcel already in a group cannot be added to another',
    steps: [
      'Create a group with parcel 10,10',
      'Click on parcel 10,10',
      'Try to add to a different group',
    ],
    expectedResults: [
      'Dropdown shows "Already in a group"',
      'Cannot add to another group',
      'Group badge shows current group',
    ],
  },

  // === GROUP NAVIGATION TESTS ===
  {
    name: 'Click group badge to view group',
    description: 'Clicking the group badge in scene details should open the group sidebar',
    steps: [
      'Click on a parcel that belongs to a group',
      'Wait for scene details to load',
      'Click on the group badge (colored button with group name)',
    ],
    expectedResults: [
      'SceneDetailSidebar closes',
      'GroupsSidebar opens in edit mode',
      'Group form shows the clicked group details',
      'Group name and color are displayed',
    ],
  },

  // === BAN/UNBAN TESTS ===
  {
    name: 'Ban isolated scene',
    description: 'Banning a scene not in a group should ban only that scene',
    steps: [
      'Click on a parcel with a scene that is NOT in any group',
      'Wait for scene details to load',
      'Click "Ban Scene" button',
    ],
    expectedResults: [
      'Button changes to "Unban Scene"',
      'Scene is marked as banned (button style changes)',
      'Clicking "Unban Scene" reverts the ban',
    ],
  },
  {
    name: 'Ban scene in a group - bans whole group',
    description: 'Banning a scene that belongs to a group should ban the entire group',
    steps: [
      'Create a group with multiple parcels',
      'Click on any parcel in that group',
      'Wait for scene details to load',
      'Verify button shows "Ban Group" (not "Ban Scene")',
      'Click "Ban Group" button',
    ],
    expectedResults: [
      'Button changes to "Unban Group"',
      'The entire group is marked as banned',
      'Clicking on other parcels in the same group shows "Unban Group"',
    ],
  },
  {
    name: 'Ban status persists across scenes in group',
    description: 'All scenes in a banned group should show as banned',
    steps: [
      'Ban a group via any scene in it',
      'Click on a different parcel in the same group',
      'Check the ban button status',
    ],
    expectedResults: [
      'The button shows "Unban Group"',
      'The banned status is consistent across all scenes in the group',
    ],
  },

  // === UI STATE TESTS ===
  {
    name: 'Coordinate display position',
    description: 'Coordinate display should not overlap with layers button',
    steps: [
      'Navigate to localhost:5173',
      'Hover over parcels to show coordinates',
    ],
    expectedResults: [
      'Coordinate display is above the layers button',
      'No visual overlap between elements',
    ],
  },
  {
    name: 'Sidebar z-index',
    description: 'Sidebars should appear above other UI elements',
    steps: [
      'Click on a parcel to open SceneDetailSidebar',
      'Verify navbar is behind sidebar',
    ],
    expectedResults: [
      'Sidebar appears on top of all other elements',
      'No UI elements bleeding through',
    ],
  },
];

/**
 * Test runner helper for Chrome extension automation
 */
export function generateTestPrompt(testCase: TestCase): string {
  return `
## Test: ${testCase.name}

**Description:** ${testCase.description}

**Steps:**
${testCase.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**Expected Results:**
${testCase.expectedResults.map((r) => `- ${r}`).join('\n')}

Please execute these steps and verify the expected results.
`;
}

/**
 * Generate a full test suite prompt
 */
export function generateFullTestSuitePrompt(): string {
  return `
# Map Interactions E2E Test Suite

Please run the following tests on localhost:5173 using browser automation.
For each test, execute the steps and verify all expected results.
Report any failures.

${mapInteractionTests.map((t) => generateTestPrompt(t)).join('\n---\n')}
`;
}
