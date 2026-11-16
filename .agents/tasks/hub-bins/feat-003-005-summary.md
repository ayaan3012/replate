# Hub Bins FEAT-003 to FEAT-005 — Final Verification Summary

## Files Changed (across commits 71cee8a → HEAD)

| File | Change |
|------|--------|
| `api/hubs.js` | Added `bins` array (from `v_hub_bin_status`) to every hub object in `list` and `nearest`; added `last_checkin` (MAX logged_at from HUB_LOG) |
| `api/data.js` | `reportUnfit`: added `destination`/`bin_id` for HUB_BIN path with transaction; `wasteJobs`: added `pickup_type`, `hub_id`, `hub_name`, `hub_address`, `bin_label`; `collect`: mixed-hub/source validation and `source_type`/`hub_id` on WASTE_COLLECTION; `unclaimed` action; `routeUnclaimed` action; `sp_route_expired_food()` throttle call in `myListings` and `wasteJobs` |
| `src/lib/api.ts` | Added `HubBin`, updated `Hub` type with `bins` and `last_checkin`; added `UnclaimedItem`, `RouteUnclaimedResponse`, `ReportUnfitResponse`; updated `WasteJob` with pickup_type fields |
| `src/components/HubList.tsx` | Exported `hubAcceptingState` and `compartmentAcceptingState` helpers; 3-state badge (Accepting / Full / Not accepting + last_checkin); waste bins count chip |
| `src/components/HubMap.tsx` | Popup shows bin free_kg for each waste bin |
| `src/pages/Hub.tsx` | Waste bins card per hub (label, Animal feed/Biogas badge, free-kg progress meter); compartment badges use `compartmentAcceptingState` |
| `src/pages/Donor.tsx` | "Needs your decision" section (unclaimed items with countdown + hub-bin picker); Unfit food dialog updated with grade + destination + nearest-hub bin picker; `sp_route_expired_food` throttle; bell count includes unclaimed items |
| `src/pages/Volunteer.tsx` | Waste runs grouped by pickup place (hub vs donor-site); receipt card after collect |
| `src/components/DashboardShell.tsx` | Bell count updated to include unclaimed donor items |
| `docs/API.md` | Documented `last_checkin` and `bins[]` on `hubs?a=list` and `hubs?a=nearest`; documented `reportUnfit` HUB_BIN fields; documented `unclaimed`, `routeUnclaimed` actions; documented `wasteJobs` pickup_type fields; documented `collect` mixed-hub error |
| `scripts/smoke.mjs` | Added Section 5: Hub bin flow (reportUnfit HUB_BIN → wasteJobs HUB_BIN → collect → free_kg check) |
| `scripts/schema-check.mjs` | Added `HUB_BIN`, `HUB_BIN_DROP` tables and `v_hub_bin_status` view to expected schema |

## Build Result

```
npm run build — PASS
tsc: no errors
vite build: 1975 modules transformed, dist built in ~3.7 s
(chunk size warning only — not an error)
```

## node --check Results

```
node --check scripts/smoke.mjs       — PASS (no output, exit 0)
node --check scripts/schema-check.mjs — PASS (no output, exit 0)
```

## smoke.mjs Result

**Skipped — no dev server running on localhost:3000.**

To run: start `vercel dev` then `node scripts/smoke.mjs`.
