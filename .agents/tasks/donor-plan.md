# Implementation Plan — Rebuild `src/pages/Donor.tsx`

## Exploration summary

The current `Donor.tsx` is a 780-line file that already has all five section sub-components
and a correct page root. It is *substantially* implemented. The plan below targets
the concrete gaps against the spec — it does not re-write what already works.

### What already works correctly
- `SectionWrap`, `Skeleton`, `EmptyState`, `StatusBadge`, `Dialog`, `Field`,
  `inputCls`/`selectCls`, `SubmitBtn`, `CopyChip` (prop is `value=`)
- `ListingForm` — shared by hub + delivery, storage forced from hub compartments,
  `is_sealed=true` forced for hub, diet tags, allergen tri-state (Contains / Free of /
  Not sure), `call("data","addListing",…)` with correct field names from API.md §4
- `OverviewSection` — `call("data","myImpact")`, 5 stat cards (meals, kg, CO₂,
  active listings, total listings), skeleton while loading
- `DonateHubSection` — `AddressSearch` + `HubMap` + `HubList`, storage options derived
  from hub compartments (no HOT), "Donate here" button, `Dialog` wrapping `ListingForm`
- `DonateDeliverySection` — button opens dialog, all three storage types
- `UnfitSection` — form with `grade` radio (ANIMAL_OK / BIOGAS_ONLY), result card
- `MyDonationsSection` — Listings tab with expand-toggle for handovers (`drop_code`
  `CopyChip` + note), Rerouted waste tab, both tables
- Page root — parallel data loads, `loadListings` refresh callback, `DashboardShell`

### Confirmed gaps (spec vs. current code)
1. **Map toolbar missing in `DonateHubSection`** — no "Locate me", "Nearest hub", or
   "Cold storage only" buttons. The section uses `AddressSearch` only.
   Pattern to follow: `HubsMapSection` in `Order.tsx` lines 224–346.
2. **No inline dialog error** — `ListingForm` and `UnfitSection` toast on error but show
   nothing inside the dialog below the button.
3. **`ConfirmationCard` is not reusable** — it is inlined in `Order.tsx`'s `FindFoodSection`
   and the unfit-food result uses a plain `div`. The spec says it must be a reusable
   component (green check, rows, button, dismiss on button or Escape).
4. **`DonateHubSection` and `DonateDeliverySection` show no confirmation card after
   `addListing` success** — `onSuccess(id)` calls `onRefresh` only.
5. **No focus trap** — `Dialog` focuses the wrapper `div` via `ref.current?.focus()` and
   handles Escape, but Tab does not cycle within the modal (no true focus trap).
6. **`CopyChip` prop name mismatch** — `Order.tsx` uses `<CopyChip code={…}/>` but
   `Donor.tsx` defines `CopyChip` with prop `value`. They are in-file copies; only
   Donor.tsx's own `CopyChip` matters here, but the inconsistency means any future
   shared component must settle on one name. Plan: keep `value=` in Donor.tsx (no
   external import exists to break).
7. **`bg-bg` token** — used in `DashboardShell` but not in tailwind.config. That is an
   existing issue in DashboardShell, not in Donor.tsx — do not touch it.

---

## Implementation plan

- [ ] 1. **Add a reusable `ConfirmationCard` component inside `Donor.tsx`**

  Define `ConfirmationCard` above the section sub-components. It renders a centred card
  with a green `CheckCircle` icon, a bold title, a list of `{ label, value }` rows, an
  optional note paragraph, and a primary button. Dismiss on button click or Escape key
  (useEffect on mount adding a keydown listener). Props:

  ```ts
  interface ConfirmationCardProps {
    title:    string;
    rows:     { label: string; value: ReactNode }[];
    note?:    string;
    btnLabel: string;
    onClose:  () => void;
  }
  ```

  Styling: `rounded-xl border border-border bg-card shadow-md p-6 flex flex-col gap-4`.
  Title: `text-center text-xl font-bold text-ink`.
  Green check: `w-14 h-14 rounded-full bg-success-tint flex items-center justify-center`
  containing `<CheckCircle size={32} className="text-success" />`.
  Rows: `flex justify-between text-sm`, label `text-muted`, value `text-ink font-medium`.
  Button: same `bg-pink text-white` class as `SubmitBtn`.

  Files: `src/pages/Donor.tsx`
  Verify: `npm run build` — TypeScript compiles with no errors.

- [ ] 2. **Wire `ConfirmationCard` into `DonateHubSection` after a successful hub listing**

  Currently `ListingForm.onSuccess` just calls `onRefresh`. Change `DonateHubSection` to
  track `confirmedId: number | null` in local state. Pass an `onSuccess` callback that:
  (a) calls `onRefresh()`, (b) closes the listing dialog, (c) sets `confirmedId` to the
  returned listing ID. Render `ConfirmationCard` (inside the section, not inside the
  dialog) when `confirmedId !== null`, with:
  - title: `"Listing published!"`
  - rows: `[{ label: "Listing ID", value: confirmedId }, { label: "Hub", value: selectedHub.name }]`
  - btnLabel: `"Done"`, onClose: `() => setConfirmedId(null)`

  `ListingForm.onSuccess(id)` already receives the `id` (number). No changes needed to
  `ListingForm` itself.

  Files: `src/pages/Donor.tsx` — `DonateHubSection` component only.
  Verify: `npm run build` passes. Manually open a donate-hub dialog, submit a listing,
  confirm the green card appears and dismisses correctly.

- [ ] 3. **Wire `ConfirmationCard` into `DonateDeliverySection` after a successful delivery listing**

  Same pattern as item 2. `DonateDeliverySection` tracks `confirmedId: number | null`.
  `onSuccess` closes the dialog, calls `onRefresh`, sets `confirmedId`. Render
  `ConfirmationCard` with:
  - title: `"Delivery listing created!"`
  - rows: `[{ label: "Listing ID", value: confirmedId }]`
  - btnLabel: `"Done"`, onClose: `() => setConfirmedId(null)`

  Files: `src/pages/Donor.tsx` — `DonateDeliverySection` component only.
  Verify: `npm run build` passes.

- [ ] 4. **Add inline dialog error to `ListingForm`**

  Add `const [formError, setFormError] = useState<string | null>(null)` to `ListingForm`.
  In the `catch` block of `handleSubmit`: call `toast(msg)` AND call
  `setFormError(msg)`. Reset `setFormError(null)` at the top of `handleSubmit` (before
  `setBusy(true)`). Render the error just above `<SubmitBtn>`:

  ```tsx
  {formError && (
    <p role="alert" className="text-xs text-error bg-error-tint rounded px-3 py-2">
      {formError}
    </p>
  )}
  ```

  Files: `src/pages/Donor.tsx` — `ListingForm` component only.
  Verify: `npm run build` passes.

- [ ] 5. **Add inline dialog error to `UnfitSection`**

  Same pattern. Add `const [formError, setFormError] = useState<string | null>(null)` to
  `UnfitSection`. Set it in the `catch` block (alongside `toast`). Clear it at the top of
  `handleSubmit`. Render it above `<SubmitBtn>` in the form. The existing `setBusy(false)`
  in both the `catch` and `finally` blocks creates a double-call — fix to use `finally`
  only (remove the `setBusy(false)` from inside the `catch`).

  Files: `src/pages/Donor.tsx` — `UnfitSection` component only.
  Verify: `npm run build` passes.

- [ ] 6. **Replace the custom unfit-food result div with `ConfirmationCard`**

  `UnfitSection` currently renders a custom green div when `result !== null`. Replace it
  with `<ConfirmationCard>` (created in item 1) rendered inside the `Dialog`, with:
  - title: `"Food routed successfully"`
  - rows:
    ```ts
    [
      { label: "Partner",    value: result.partner_name },
      { label: "Route",      value: result.route_type },
      { label: "Weight",     value: `${n(result.kg).toFixed(2)} kg` },
    ]
    ```
  - btnLabel: `"Done"`, onClose: `() => { setOpen(false); setResult(null); }`

  The `ConfirmationCard` already handles Escape via its own useEffect — wrapping it inside
  the `Dialog` means two Escape handlers fire. Fix: when `result !== null`, render
  `ConfirmationCard` *outside* the `Dialog` (same pattern as the donate-hub confirmation
  in item 2), and do not open the `Dialog` in that state.

  Files: `src/pages/Donor.tsx` — `UnfitSection` component only.
  Verify: `npm run build` passes. Manually submit unfit food, confirm confirmation card
  appears, confirm Escape dismisses it cleanly.

- [ ] 7. **Add map toolbar to `DonateHubSection` (Locate me, Nearest hub, Cold storage only)**

  This is the most substantial change. Model it on `HubsMapSection` in `Order.tsx`
  lines 224–346. Add these state variables to `DonateHubSection`:

  ```ts
  const [locateBusy,  setLocateBusy]  = useState(false);
  const [nearestBusy, setNearestBusy] = useState(false);
  const [coldOnly,    setColdOnly]    = useState(false);
  ```

  Add two handler functions:

  **`handleLocateMe`** — mirror of `Order.tsx` `handleLocateMe`:
  - Guard: `if (!navigator.geolocation) { toast('Geolocation not supported…'); return; }`
  - `setLocateBusy(true)`, call `navigator.geolocation.getCurrentPosition(…)`.
  - On success: set `userLoc`, fetch `/api/hubs?a=nearest&lat=&lng=`, call `setHubs` +
    `setUserLoc`, auto-select first hub.
  - On error: `setLocateBusy(false)`, `toast('Location access denied…', 'info')`.

  **`handleNearestHub`** — mirror of `Order.tsx` `handleNearestHub`:
  - Guard: `if (!profile?.address) { toast('Profile address not loaded yet'); return; }`
  - Geocode `profile.address` via `/api/geo?a=geocode&q=…`, then fetch
    `/api/hubs?a=nearest&lat=&lng=`, call `setHubs` + `setUserLoc` + auto-select.

  Add `visibleHubs` derived value:
  ```ts
  const visibleHubs = coldOnly
    ? hubs.filter(h => h.compartments.some(c => c.temp_controlled))
    : hubs;
  ```
  Pass `visibleHubs` (not `hubs`) to both `HubMap` and `HubList`.

  Render the toolbar **above** the `AddressSearch` component:
  ```tsx
  <div className="flex flex-wrap items-center gap-2 mb-3">
    <button onClick={handleLocateMe} disabled={locateBusy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-border bg-card text-ink hover:bg-border disabled:opacity-50 transition-colors">
      {locateBusy ? <Loader2 size={13} className="animate-spin"/> : <LocateFixed size={13}/>}
      Locate me
    </button>
    <button onClick={handleNearestHub} disabled={nearestBusy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-border bg-card text-ink hover:bg-border disabled:opacity-50 transition-colors">
      {nearestBusy ? <Loader2 size={13} className="animate-spin"/> : <MapPin size={13}/>}
      Nearest hub
    </button>
    <button onClick={() => setColdOnly(v => !v)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
        coldOnly ? 'bg-blue-tint border-blue text-blue' : 'bg-card border-border text-ink hover:bg-border'
      }`}>
      <Snowflake size={13}/>
      Cold storage only
    </button>
  </div>
  ```

  Add missing icon imports at the top of the file: `LocateFixed, Snowflake` from
  `lucide-react`. `MapPin` is not yet imported in Donor.tsx — add it too.

  Files: `src/pages/Donor.tsx` — imports block + `DonateHubSection` component.
  Verify: `npm run build` passes. Confirm toolbar renders in the UI, Locate me requests
  geolocation, Cold storage only filters hub list.

- [ ] 8. **Add focus-trap cycling to `Dialog`**

  The `Dialog` component focuses the wrapper div on mount and closes on Escape. Add focus
  cycling so Tab/Shift-Tab stay within the modal. In the Dialog `useEffect`, after
  attaching the Escape listener, add a `keydown` handler for Tab:

  ```ts
  const trapFocus = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusable = ref.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
    ) ?? [];
    const els = Array.from(focusable);
    if (els.length === 0) return;
    const first = els[0];
    const last  = els[els.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', trapFocus);
  return () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keydown', trapFocus);
  };
  ```

  This replaces the current cleanup that only removes `onKey`. Keep the `ref.current?.focus()` call for initial focus.

  Files: `src/pages/Donor.tsx` — `Dialog` component only.
  Verify: `npm run build` passes. Open any dialog, confirm Tab cycles within the modal
  and does not reach behind the backdrop.

- [ ] 9. **Per-field validation in `ListingForm`**

  Add a `validate` function called at the top of `handleSubmit` before `setBusy(true)`.
  Return early with `setFormError(msg)` if any check fails. Checks:
  - `food_name.trim().length === 0` → "Food name is required"
  - `qty <= 0 || !Number.isFinite(qty)` → "Quantity must be a positive number"
  - `weight <= 0 || !Number.isFinite(weight)` → "Kg per unit must be positive"
  - `hours <= 0 || !Number.isFinite(hours)` → "Expiry hours must be positive"
  - `!category_id` → "Category is required"
  - (For delivery only, i.e. `hubId === null`) no extra sealed-food enforcement beyond the
    checkbox — it is optional for delivery per the spec.
  - For hub (`hubId !== null`): `storage === 'HOT'` → "Hot storage is not allowed for hub
    donations" (defensive; the select is already restricted).

  These validations run purely client-side and are in addition to the `required` attributes
  already on the inputs.

  Files: `src/pages/Donor.tsx` — `ListingForm` component only.
  Verify: `npm run build` passes. In the browser, submit empty food name and confirm the
  inline error appears without a network request firing.

- [ ] 10. **Run final build verification**

  Run `npm run build` from the project root. Fix any TypeScript errors introduced by the
  above changes. The build must complete with zero errors.

  Files: none (verification step only).
  Verify: `npm run build` exits 0 with no TypeScript errors.

---

## Verification

**Command run:** `npm run build` (from `c:\Users\akaya\OneDrive\Documents\ayaan\dbms_proj`)

**Result:** ✅ Exit code 0. TypeScript compiler emitted no errors. Vite built successfully in 2.29s.

Output summary:
```
✓ 1975 modules transformed.
dist/index.html                   0.58 kB │ gzip:   0.37 kB
dist/assets/index-DqMC0CUc.css   36.82 kB │ gzip:  11.55 kB
dist/assets/index-rPruAuRi.js   578.53 kB │ gzip: 174.03 kB
✓ built in 2.29s
```

(The 500 kB chunk warning is pre-existing and unrelated to this change.)

**Changes implemented in `src/pages/Donor.tsx`:**
1. Added `leaflet/dist/leaflet.css` import at top of file.
2. Added `ConfirmationCard` component (green check, rows, Escape + button dismiss).
3. Wired `ConfirmationCard` into `DonateHubSection` after successful `addListing` (shows Listing ID + hub name).
4. Wired `ConfirmationCard` into `DonateDeliverySection` after successful `addListing` (shows Listing ID).
5. Added `formError` inline error state to `ListingForm` — shown under allergens, above SubmitBtn.
6. Added `formError` inline error state to `UnfitSection` — shown above SubmitBtn.
7. Replaced custom unfit-food result div with `ConfirmationCard` rendered outside the Dialog (avoids double Escape handlers).
8. Added full map toolbar to `DonateHubSection`: Locate me (geolocation), Nearest hub (geocode profile address), Cold storage only toggle.
9. Added address search bar (text input + Search button with geocode + nearest) to `DonateHubSection`, replacing `AddressSearch` component import.
10. Added `displayHubs` / `visibleHubs` derived state so toolbar filters work independently of full hub list.
11. Added focus trap (Tab cycling) to `Dialog` component.
12. Added per-field client-side validation in `ListingForm` (food name, category, qty, weight, hours).
13. Fixed `StatusBadge` to cover all spec statuses: APPROVED, COMPLETED, COLLECTED, DROPPED (success); PENDING, AWAITING_DROP, SCHEDULED (blue); ROUTED, IN_TRANSIT (pink); EXPIRED, CANCELLED, REJECTED, LOCKED (error).
14. Added `LocateFixed`, `Snowflake`, `MapPin`, `CheckCircle` to lucide-react imports.
15. Removed unused `AddressSearch` import.

---

## Cross-cutting notes for the implementer

**Import additions required** (items 7 & 8):
```ts
// Add to existing lucide-react import line:
import {
  Utensils, Leaf, Wind, Copy, Check, ChevronDown, ChevronUp,
  Loader2, X, AlertCircle,
  LocateFixed, MapPin, Snowflake,   // ← add these three
} from "lucide-react";
```

**No new files** — all changes are in `src/pages/Donor.tsx` only.
Do not touch `/api`, `/sql`, `tailwind.config.ts`, or any other page.

**Token usage** — all colours must use Tailwind tokens from `tailwind.config.ts`:
`text-pink`, `bg-pink-tint`, `text-success`, `bg-success-tint`, `text-error`,
`bg-error-tint`, `text-blue`, `bg-blue-tint`, `border-border`, `bg-card`, `text-ink`,
`text-muted`. No hardcoded hex values.

**`n()` wrapping** — any DECIMAL field arriving from the API
(`quantity_remaining`, `kg_diverted`, `meals_saved`, `co2_avoided_kg`, `trust_score`,
`quantity_kg`, `distance_km`, `free_kg`, `max_weight_kg`) must be wrapped in `n()` before
arithmetic or `.toFixed()`.

**Dependency order**: items 1 → 2, 1 → 3, 1 → 6. Items 4, 5 are independent.
Item 7 depends on item 7's own import additions only. Item 8 is independent.
Item 9 requires item 4 (shares `formError` state). Item 10 is the final gate.
