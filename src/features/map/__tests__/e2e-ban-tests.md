# Ban/Unban E2E Test Cases

## Prerequisites

1. **Backend Setup**:
   - Mobile-bff must be running locally on `http://localhost:3000`
   - Database migrations must be applied (bans table)
   - `ALLOWED_USERS` env var must include the test wallet address

2. **Frontend Setup**:
   - Update `src/config/env/dev.json` to point `MOBILE_BFF_URL` to `http://localhost:3000`
   - Run frontend dev server (`npm run dev`)

3. **Authentication**:
   - Sign in with a wallet address that is in `ALLOWED_USERS`
   - Default dev identity: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`

---

## Test Cases

### Test 1: Ban an Isolated Scene (Parcel)

**Steps**:
1. Click on a parcel on the map that does NOT belong to any group
2. Wait for the SceneDetailSidebar to open
3. Verify the "Ban Scene" button is visible (red button)
4. Click the "Ban Scene" button

**Expected Results**:
- POST request to `/backoffice/bans` returns 201
- Button changes to "Unban Scene"
- Ban is persisted in database

**API Request**:
```json
POST /backoffice/bans
{
  "targetType": "scene",
  "targetId": "-39,-8",
  "parcels": [{"x": -39, "y": -8}]
}
```

---

### Test 2: Unban an Isolated Scene (Parcel)

**Steps**:
1. With a banned parcel's SceneDetailSidebar open
2. Verify the "Unban Scene" button is visible
3. Click the "Unban Scene" button

**Expected Results**:
- DELETE request to `/backoffice/bans/{banId}` returns 200
- Button changes back to "Ban Scene"
- Ban is removed from database

**API Request**:
```
DELETE /backoffice/bans/44cbb1fb-7179-4e00-b934-b9de921d69b7
```

---

### Test 3: Ban a Group from GroupsSidebar

**Prerequisites**: Create a scene group first

**Steps**:
1. Click the floating action button (layers icon) to open GroupsSidebar
2. Locate a group in the list
3. Click the "Ban" button on the group card

**Expected Results**:
- POST request to `/backoffice/bans` returns 201
- "BANNED" badge appears next to the group name
- Button changes from "Ban" (red) to "Unban" (green)
- Group card styling indicates banned state

**API Request**:
```json
POST /backoffice/bans
{
  "targetType": "group",
  "targetId": "uuid-of-the-group"
}
```

---

### Test 4: Unban a Group from GroupsSidebar

**Steps**:
1. With GroupsSidebar open and a banned group visible
2. Verify the "BANNED" badge is shown
3. Click the "Unban" button on the group card

**Expected Results**:
- DELETE request to `/backoffice/bans/{banId}` returns 200
- "BANNED" badge disappears
- Button changes from "Unban" (green) to "Ban" (red)
- Group card styling returns to normal

---

### Test 5: Ban a Scene That Belongs to a Group

**Steps**:
1. Click on a parcel that belongs to a scene group
2. Wait for the SceneDetailSidebar to open
3. Verify the button shows "Ban Group" (not "Ban Scene")
4. Click the "Ban Group" button

**Expected Results**:
- The ban is created for the GROUP (not the individual scene)
- POST request uses `targetType: "group"`
- Button changes to "Unban Group"

---

### Test 6: Verify Ban Persistence After Page Refresh

**Steps**:
1. Ban a group or scene
2. Refresh the page (F5 or navigate away and back)
3. Open the GroupsSidebar or SceneDetailSidebar

**Expected Results**:
- Previously banned items still show as banned
- GET request to `/backoffice/bans` returns the ban list
- UI correctly reflects ban status

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/backoffice/bans` | Fetch all bans |
| POST | `/backoffice/bans` | Create a new ban |
| DELETE | `/backoffice/bans/:id` | Delete a ban (unban) |

### Request/Response Format

**Create Ban Request**:
```json
{
  "targetType": "group" | "scene",
  "targetId": "group-uuid" | "parcel-key",
  "parcels": [{"x": number, "y": number}],  // optional, for scene bans
  "reason": "string"  // optional
}
```

**Ban Response**:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "targetType": "group" | "scene",
    "targetId": "string",
    "parcels": [{"x": number, "y": number}],
    "reason": "string",
    "createdBy": "wallet-address",
    "createdAt": 1234567890
  }
}
```

---

## Test Results Summary

| Test | Description | Status |
|------|-------------|--------|
| 1 | Ban isolated scene | PASSED |
| 2 | Unban isolated scene | PASSED |
| 3 | Ban group from GroupsSidebar | PASSED |
| 4 | Unban group from GroupsSidebar | PASSED |
| 5 | Ban scene in group (bans group) | Not tested |
| 6 | Ban persistence after refresh | Not tested |

---

## Notes

- All backoffice endpoints require signed fetch authentication (ADR-44)
- Only users in `ALLOWED_USERS` can create/delete bans
- Scene bans use a sorted parcel key format: `"x1,y1|x2,y2|x3,y3"`
- Group bans use the group's UUID as targetId
