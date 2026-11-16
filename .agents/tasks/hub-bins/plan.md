# Implementation Plan — Hub Waste Bins & "Needs Your Decision" Flow

Project: Surplus Food Rescue. Vercel serverless API (Node, CommonJS, mysql2) on Aiven MySQL 8
(`surplus_food_rescue`). **Do NOT touch `/sql`.** All SQL parameterised (`?`). DECIMAL values arrive
as strings — wrap in `Number()` (helper `n()`) in the UI. Errors as toasts. No fake data. If a query
fails because of a trigger, return `e.sqlMessage` verbatim — do not work around it.

The DB tables/view/trigger already exist: `HUB_BIN`, `HUB_BIN_DROP`, `v_hub_bin_status`, and the
`HUB_BIN_DROP` insert trigger (validates hub active, routing pending+uncollected, bin type matches
grade: ANIMAL←ANIMAL_OK, BIOGAS←BIOGAS_ONLY, enough free kg). Its message is in `e.sqlMessage`.

## Exploration findings (grounding)

- `api/hubs.js`: `groupHubs()` builds hubs from `v_hub_status`; `attachAvailableItems(hubs)` runs for
  **both** `list` and `nearest`, already adds `available_items` and `last_checkin` (from `HUB_LOG`).
  `ids`/`ph` are in scope inside `attachAvailableItems` — reuse them for the bins query.
- `api/data.js`: structure is `require("../lib/util")` → `needVolunteerRole` helper →
  `module.exports = async (req,res) => { switch(a){…} }`. `q`, `need`, `pool`, `user`, `errJson` are
  in scope. `reportUnfit` opens a `conn` transaction, inserts FOOD_LISTING, calls
  `fn_pick_partner(type, category_id, kg)` (ANIMAL_OK→FARM then ANIMAL_SHELTER fallback;
  BIOGAS_ONLY→BIOGAS), inserts WASTE_ROUTING, updates FOOD_LISTING to ROUTED, commits, returns
  `{partner_name, route_type, kg}`. It does **not** capture the WASTE_ROUTING insert id.
  `collect` already validates single partner, inserts WASTE_COLLECTION with hardcoded
  `source_type='DONOR_SITE'` (no hub_id), receipt_ref `RCPT-${partnerId}-${Date.now()}`.
- `src/lib/api.ts`: `Hub` interface has `last_checkin?` and `compartments`; `n()` coerces DECIMAL.
  `ReportUnfitResponse` = `{partner_name, route_type, kg}`. `WasteJob` has no `pickup_type`.
- `src/components/HubList.tsx`: exports `hubAcceptingState()` and `compartmentAcceptingState()`.
  Stats row currently shows distance/cold/ambient/items. Imports `Thermometer, Wind, Package,
  CheckCircle, XCircle, AlertCircle` — **no `Trash2`**.
- `src/components/DashboardShell.tsx`: `NAV.DONOR` = overview, donate-hub, donate-delivery,
  unfit-food, my-donations. Imports `AlertTriangle` but **not `AlertCircle`**. Sidebar logo, top-bar
  user block, and bottom-left About button already done (prior task).
- `src/pages/Donor.tsx`: `UnfitSection({categories, onRefresh})` — no profile access. `OverviewSection`
  shows 3 impact stat cards + "Active listings" + "Total listings". `MyDonationsSection` has
  listings/waste tabs. Page root loads profile/categories/tags + listings/routings; `loadListings`
  refreshes. `SectionWrap` uses `scroll-mt-6` and ids match sidebar anchors.
- `src/pages/Volunteer.tsx`: `WasteRunsTab` groups via `groupByPartner(jobs)` (key=partner_id),
  shows partner header + per-job checkboxes; `toggleItem` enforces single partner via
  `activePartner`; `selectedGroup` drives the collect form header; receipt via `ConfirmationCard`.
- `src/pages/Hub.tsx`: imports `compartmentAcceptingState` from HubList; `selectedHub` is a `Hub`.
  Compartment grid block ends with the `available_items` note.
- `src/components/HubMap.tsx`: `Popup` shows name/address/status/available_items. Uses `n()`.
- `docs/API.md`: documents all endpoints; hubs §1/§2 lack `bins`; reportUnfit §5 lacks
  destination/bin_id; wasteJobs §17 lacks pickup_type/hub fields; collect §20 hardcodes DONOR_SITE.
- `scripts/smoke.mjs`: sections 0–4; `isNumeric` helper; cleanup connects to DB directly; tests hit
  `http://localhost:3000`. Needs dev server + DATABASE_URL to run.
- `scripts/schema-check.mjs`: `EXPECTED` table map; queries `information_schema.COLUMNS`, then
  `conn.end()` **before** the check loop. No VIEWS check yet.
- Build: `npm run build` = `tsc -p tsconfig.json && vite build` (TS type errors fail the build).

## Decisions (resolving spec gaps)

1. **`hub_address` in HUB_BIN response.** ITEM 2's listed return omits address, but ITEM 5's
   confirmation card text is "…at <hub name, <address>". The step-(4) query selects `ch.address`, so
   include `hub_address` in both `reportUnfit` and `routeUnclaimed` HUB_BIN responses, and in the
   `ReportUnfitResponse`/routeUnclaimed TS type.
2. **"Bell count" = a stat card.** No bell/notification UI exists. Implement
   `needs_decision_count` as an extra "Needs your decision" stat card in the donor Overview
   (value = unclaimed item count), and lift the unclaimed list into the page root so Overview and
   the new Needs-decision section share one fetch.
3. **DONOR nav order.** Insert `needs-decision` immediately before `my-donations` so nav order matches
   the page's section order (section renders just above My donations). Add `AlertCircle` to the
   lucide-react import in DashboardShell.
4. **Shared grade+destination picker.** Both the Unfit dialog and the Needs-decision rows need the
   same grade radios + "Where should it go?" radios + nearest-hub-bin selector. Extract one
   `GradeDestinationPicker` sub-component in Donor.tsx (used by both) rather than duplicating.
5. **Bin-type check + trigger both run.** The app pre-checks `bin_type` vs grade and returns
   `This bin does not accept <grade> food`; the `HUB_BIN_DROP` insert trigger is the real enforcer
   (returns `e.sqlMessage` for capacity/hub-state/etc.). Keep both. Extract a small
   `dropIntoBin(conn, binId, wasteId, grade)` module-level helper used by reportUnfit + routeUnclaimed.
6. **nearest hubs for HUB_BIN use the donor's profile lat/lng** (already geocoded at registration) —
   call `/api/hubs?a=nearest&lat=&lng=` directly, no re-geocode. If profile coords are 0/0, show a
   toast and disable the HUB_BIN option.

## Ordered, file-by-file plan (backend → frontend → docs/scripts)

- [ ] **1. Backend: attach `bins` to hubs.** In `api/hubs.js` `attachAvailableItems`, after the
      `last_checkin` query (reusing `ids`/`ph`), query `v_hub_bin_status` for `bin_id, hub_id,
      bin_type, label, max_weight_kg, free_kg`, group by `hub_id`, and set `h.bins = binMap.get(h.hub_id) || []`
      on each hub (DECIMAL `max_weight_kg`/`free_kg` left as strings). Keep all existing fields.
      Files: `api/hubs.js`
      Verify: `node --check api/hubs.js` passes.

- [ ] **2. Backend: shared types in api.ts.** Add `HubBin` interface
      `{bin_id:number; bin_type:"ANIMAL"|"BIOGAS"; label:string; max_weight_kg:string|number;
      free_kg:string|number}`, add `bins?: HubBin[]` to `Hub`. Add `UnclaimedItem`
      `{listing_id:number; food_name:string; quantity_remaining:string|number; quantity_unit:string;
      kg_left:string|number; expires_at:string; minutes_left:string|number}`. Extend
      `ReportUnfitResponse` with `destination:"DONOR_SITE"|"HUB_BIN"` and optional
      `hub_name?/hub_address?/bin_label?`. Extend `WasteJob` with
      `pickup_type:"HUB_BIN"|"DONOR_SITE"` and optional `hub_id?/hub_name?/hub_address?/bin_label?`.
      Files: `src/lib/api.ts`
      Verify: `npm run build` — TS compiles (existing pages don't read the new fields, so they still pass).

- [ ] **3. Backend: maybeAutoRoute throttle + unclaimed + routeUnclaimed + reportUnfit HUB_BIN +
      wasteJobs/collect.** All in `api/data.js`:
      - At module top (after `needVolunteerRole`, before `module.exports`) add
        `let _lastAutoRoute = 0; async function maybeAutoRoute(){ if(Date.now()-_lastAutoRoute < 10*60*1000) return; _lastAutoRoute = Date.now(); try{ await pool.query("CALL sp_route_expired_food()"); }catch(_){} }`.
      - Add module-level `async function dropIntoBin(conn, binId, wasteId, grade)` that selects
        `bin_type` from `HUB_BIN` (throw "Bin not found" if absent), checks `ANIMAL_OK→"ANIMAL"`,
        `BIOGAS_ONLY→"BIOGAS"` (throw `This bin does not accept ${grade} food` on mismatch), then
        `INSERT INTO HUB_BIN_DROP (bin_id, waste_id) VALUES (?, ?)` (trigger errors propagate).
      - `reportUnfit`: destructure `destination = "DONOR_SITE"` and `bin_id`; capture the WASTE_ROUTING
        insert id as `wasteId`; before commit, if `destination==="HUB_BIN"` validate `bin_id`, call
        `dropIntoBin(conn, Number(bin_id), wasteId, grade)`. After commit, default return gains
        `destination:"DONOR_SITE"`; HUB_BIN return adds
        `{destination:"HUB_BIN", hub_name, hub_address, bin_label}` fetched after commit via
        `SELECT ch.name AS hub_name, ch.address AS hub_address, hb.label AS bin_label FROM HUB_BIN
        hb JOIN COMMUNITY_HUB ch ON ch.hub_id=hb.hub_id WHERE hb.bin_id=?`.
      - `myListings`: add `await maybeAutoRoute();` as the first line of the case.
      - Add `case "unclaimed"` (DONOR) running the spec's exact SELECT (status AVAILABLE,
        quantity_remaining>0, hub_id IS NULL, expires_at <= NOW()+INTERVAL 2 HOUR; `kg_left =
        v.quantity_remaining * l.weight_per_unit_kg`; `minutes_left = TIMESTAMPDIFF(MINUTE,NOW(),expires_at)`).
      - Add `case "routeUnclaimed"` (DONOR) `{listing_id, grade, destination="DONOR_SITE", bin_id?}`:
        verify ownership (donor's, status AVAILABLE, hub_id NULL) → get `kg_left` → partner pick
        (same fn_pick_partner logic) → `INSERT WASTE_ROUTING (…, quantity_kg=kgLeft)` capturing
        `wasteId` → `UPDATE FOOD_LISTING SET status='ROUTED'` → if HUB_BIN call `dropIntoBin` →
        commit → return same shape as reportUnfit (with `hub_name/hub_address/bin_label` for HUB_BIN).
      - `wasteJobs`: add `await maybeAutoRoute();` first; replace the SELECT with the spec's join
        (LEFT JOIN HUB_BIN_DROP/HUB_BIN/COMMUNITY_HUB; `pickup_type = CASE WHEN hbd.drop_id IS NOT
        NULL THEN 'HUB_BIN' ELSE 'DONOR_SITE' END`; plus `hb.hub_id, ch.name AS hub_name,
        ch.address AS hub_address, hb.label AS bin_label`; `ORDER BY pickup_type DESC, wr.waste_id`).
      - `collect`: after the single-partner check, run the pickup-info query
        (`SELECT DISTINCT hbd.bin_id, hb.hub_id, CASE WHEN hbd.drop_id IS NOT NULL THEN 'HUB_BIN'
        ELSE 'DONOR_SITE' END AS pickup_type FROM WASTE_ROUTING wr LEFT JOIN HUB_BIN_DROP hbd ON
        hbd.waste_id=wr.waste_id LEFT JOIN HUB_BIN hb ON hb.bin_id=hbd.bin_id WHERE wr.waste_id IN
        (…)`). Rules: all DONOR_SITE → `source_type='DONOR_SITE'`, `hub_id=NULL`; all HUB_BIN same hub
        → `source_type='HUB'`, `hub_id=that hub`; mixed or multiple hubs → rollback + `400 { error:
        "Collect hub-bin items and donor-site items separately, one hub at a time" }`. Change the
        WASTE_COLLECTION INSERT to use the computed `source_type` and `hub_id`. Keep
        `receipt_ref = RCPT-${partnerId}-${Date.now()}`.
      Files: `api/data.js`
      Verify: `node --check api/data.js` passes; `npm run build` passes (types from step 2).
      Depends on: step 2 (api.ts types must exist before tsc checks the file set).

- [ ] **4. Donor UI: Unfit dialog + Needs-decision section + Overview stat + nav.**
      - `src/components/DashboardShell.tsx`: add `AlertCircle` to the lucide-react import; insert
        `{ id:"needs-decision", label:"Needs your decision", icon:AlertCircle }` into `NAV.DONOR`
        just before the `my-donations` entry.
      - `src/pages/Donor.tsx`:
        - Add a `GradeDestinationPicker` sub-component (grade radios "Safe for animals"/"Only for
          biogas"; "Where should it go?" radios default `DONOR_SITE` / `HUB_BIN`; when HUB_BIN, fetch
          `/api/hubs?a=nearest&lat=&lng=` from `n(profile.latitude)`/`n(profile.longitude)`, filter
          each hub's `bins` by grade (ANIMAL_OK→bin_type `ANIMAL`, BIOGAS_ONLY→`BIOGAS`), render a
          radio list "Hub name — bin_label — X kg free", disable bins where `n(free_kg)===0`; expose
          selected `grade`, `destination`, `bin_id` via props/callbacks).
        - `UnfitSection`: accept a `profile` prop; render the picker after the existing grade radios;
          on submit include `destination` + `bin_id`; in the confirmation card, for HUB_BIN add a row
          "Drop at" = `Please place the food in the ${bin_label} at ${hub_name}, ${hub_address}`.
        - Add `NeedsDecisionSection({profile, onRefresh})`: load `/api/data?a=unclaimed` on mount +
          after actions; render only when non-empty (section id `needs-decision`, above My
          donations). Each row: `food_name` (bold), `${n(kg_left)} kg`, countdown
          (`minutes_left<0 → "Expired"` else `Xh Ym left`), the note "If you do not choose, we send it
          to a partner automatically after it expires", a `GradeDestinationPicker`, and a "Route this
          food" button calling `routeUnclaimed({listing_id, grade, destination, bin_id})`; show a
          `ConfirmationCard` on success (same hub line for HUB_BIN), then `onRefresh()`.
        - Page root: load `unclaimed` into state (shared); pass `unclaimedCount` to `OverviewSection`
          (new 6th stat card "Needs your decision", `AlertCircle` amber) and pass `unclaimed` +
          `reloadUnclaimed` to `NeedsDecisionSection`; render `<NeedsDecisionSection>` immediately
          before `<MyDonationsSection>`.
      Files: `src/components/DashboardShell.tsx`, `src/pages/Donor.tsx`
      Verify: `npm run build` passes.
      Depends on: steps 2–3 (api.ts types + backend endpoints).

- [ ] **5. Volunteer UI: group waste jobs by pickup place.**
      - `src/pages/Volunteer.tsx`: replace `groupByPartner` with `groupByPickup` — HUB_BIN items group
        by `hub_id` with header `Collect from ${hub_name} - ${bin_label}`; DONOR_SITE items group
        under header `Donor addresses`. Keep per-job checkboxes and the single-partner constraint
        (`activePartner` logic unchanged). Show `partner_name` per item (since groups are no longer
        per-partner). Derive the collect-form partner name from the selected jobs
        (`wasteJobs.find(j => selected.has(j.waste_id))?.partner_name`). The mixed-hub case is
        enforced by the backend; surface its error as a toast. Receipt card unchanged.
      Files: `src/pages/Volunteer.tsx`
      Verify: `npm run build` passes.
      Depends on: steps 2–3.

- [ ] **6. Hub UI: waste bins card + bin free kg on map + HubList stat.**
      - `src/pages/Hub.tsx`: below the compartment grid (after the `available_items` note), add a
        "Waste bins at <name>" card — if `!selectedHub.bins?.length` show "No waste bins at this
        hub"; else render each bin with label, a type badge ("Animal feed" for `ANIMAL`,
        "Biogas" for `BIOGAS`), and a `free_kg / max_weight_kg` progress meter.
      - `src/components/HubList.tsx`: add `Trash2` to the lucide import; in the stats row, when
        `hub.bins?.length > 0`, show `<Trash2/> {n} waste bin(s)`.
      - `src/components/HubMap.tsx`: in each hub `Popup`, after the available-items line, when
        `hub.bins?.length > 0` show each bin's free kg (e.g. `${b.label}: ${n(b.free_kg).toFixed(1)} kg free`).
      Files: `src/pages/Hub.tsx`, `src/components/HubList.tsx`, `src/components/HubMap.tsx`
      Verify: `npm run build` passes.
      Depends on: steps 1–2.

- [ ] **7. Docs + smoke + schema-check.**
      - `docs/API.md`: document `bins[]` on hubs `list`/`nearest`; `destination`+`bin_id` and the
        HUB_BIN response fields on `reportUnfit`; new `unclaimed` and `routeUnclaimed` actions
        (method, body, response fields); `pickup_type`/`hub_id`/`hub_name`/`hub_address`/`bin_label`
        on `wasteJobs`; the mixed-hub `collect` error and `source_type='HUB'`/`hub_id` behaviour.
      - `scripts/smoke.mjs`: after "4. Waste flow" add "5. Hub bin flow" — GET `hubs?a=list`, find the
        first ACTIVE hub with bins whose `free_kg>0`; if none, print `skipped - no hub bins in DB`
        and pass through. Otherwise: pick its first bin, derive grade from `bin_type`
        (ANIMAL→ANIMAL_OK, BIOGAS→BIOGAS_ONLY); POST `reportUnfit` with `destination:'HUB_BIN'`,
        `bin_id`, that grade — assert `destination==='HUB_BIN'` + `hub_name` + `bin_label` present;
        GET `wasteJobs` — assert an item with `pickup_type==='HUB_BIN'` and matching `hub_id`
        exists; POST `collect` with that `waste_id` — assert `ok:1`; GET `hubs?a=list` — find the hub
        and assert the bin's `free_kg` is numeric (decreased if it was >0 before).
      - `scripts/schema-check.mjs`: add to `EXPECTED`:
        `HUB_BIN:["bin_id","hub_id","bin_type","label","max_weight_kg"]` and
        `HUB_BIN_DROP:["drop_id","bin_id","waste_id","dropped_at"]`; query
        `information_schema.VIEWS` (before `conn.end()`), build a set of view names, and after the
        tables loop print `MISSING view v_hub_bin_status` if it is absent (count it in
        `missingCount`).
      Files: `docs/API.md`, `scripts/smoke.mjs`, `scripts/schema-check.mjs`
      Verify: `node --check scripts/smoke.mjs && node --check scripts/schema-check.mjs` pass
      (syntax). Runtime: `node scripts/schema-check.mjs` (needs DATABASE_URL) and
      `node scripts/smoke.mjs` (needs dev server on :3000 + DATABASE_URL).
      Depends on: steps 1–3 (backend must exist for smoke/schema to pass).

## Final verification (after all items)
- `node --check api/hubs.js && node --check api/data.js`
- `npm run build` (tsc + vite)
- `node scripts/schema-check.mjs` (needs DATABASE_URL)
- `node scripts/smoke.mjs` (needs dev server on :3000 + DATABASE_URL)

## Files changed (summary)
Backend: `api/hubs.js`, `api/data.js`, `src/lib/api.ts`
Frontend: `src/components/DashboardShell.tsx`, `src/pages/Donor.tsx`, `src/pages/Volunteer.tsx`,
`src/pages/Hub.tsx`, `src/components/HubList.tsx`, `src/components/HubMap.tsx`
Docs/scripts: `docs/API.md`, `scripts/smoke.mjs`, `scripts/schema-check.mjs`
