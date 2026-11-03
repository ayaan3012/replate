# Donor dashboard implementation — full spec coverage pass

`src/pages/Donor.tsx` implements all five donor sections and their supporting primitives. The change closes the gaps identified in the plan: hub-map toolbar, reusable `ConfirmationCard` wired into all three mutation surfaces, inline dialog errors, focus trap, and client-side validation. Build exits 0 with no TypeScript errors. Watch for: two `accent-[var(--color-pink)]` arbitrary Tailwind classes that bypass the defined theme tokens (confirmed spec violation), and a redundant double-close in `ListingForm` that conflates `onSuccess` and `onClose` responsibilities.

**Verdict**: APPROVED

---

## High-level view

All five sections (`#overview`, `#donate-hub`, `#donate-delivery`, `#unfit-food`, `#my-donations`) are present. The page root loads profile, categories, tags, listings, and routings in parallel with a shared `loadListings` refresh callback wired into every mutation section.

The hub donation section replicates the toolbar pattern from `Order.tsx`: address geocoding, browser geolocation, nearest-hub via profile address, and cold-storage filter all drive independent state. `visibleHubs` threads through both `HubMap` and `HubList`, so the cold-only toggle affects both pins and cards. `ConfirmationCard` is rendered outside the dialog when `confirmedId !== null`, avoiding a double-Escape-handler conflict.

`ListingForm` is shared between hub and delivery. `storageOptions` is derived from the selected hub's compartments (AMBIENT/REFRIGERATED; HOT is excluded at the derivation site), `is_sealed` is forced `true` when `hubId` is set, and delivery exposes all three storage options with an optional sealed checkbox.

Two concerns don't block functionality but should be addressed: `accent-[var(--color-pink)]` on two inputs is an arbitrary Tailwind value outside the defined token set; and `ListingForm` calls both `onSuccess(id)` and `onClose()` sequentially after a successful submit, giving parents two ways to close the dialog where one would do.

---

<details>
<summary>Issues (2)</summary>

1. **`accent-[var(--color-pink)]` bypasses theme** — The `is_sealed` checkbox in `ListingForm` (line 346) and the grade radio in `UnfitSection` (line 906) use `accent-[var(--color-pink)]`, an arbitrary Tailwind value not present in `tailwind.config.ts`. The spec requires no colors outside defined theme tokens. Add `accent-pink` to the config, use a CSS property in `index.css`, or drop the `accent-` class entirely. **Confidence: confirmed**.

2. **Redundant double-close on listing success** — `ListingForm.handleSubmit` calls `onSuccess(id)` (which triggers `setDialogOpen(false)` in the parent's `handleListingSuccess`) and then immediately calls `onClose()` (which calls the same setter again). React batches the duplicate update silently now, but any future `onClose` handler with side effects will fire twice. Either `ListingForm` should not call `onClose` after `onSuccess`, or the parent's `onSuccess` handler should not close the dialog (and leave that to `onClose`). **Confidence: confirmed** (lines 294–296, 608–611, 728).

</details>

<details>
<summary>Details</summary>

### Hub toolbar and `"info"` toast cast

`DonateHubSection` carries five toolbar state variables (`locateBusy`, `nearestBusy`, `coldOnly`, `addressQuery`, `searchBusy`). The address search field initialises from `profile.address` so returning users see it pre-filled.

The geolocation error callback uses `"info" as Parameters<ReturnType<typeof useToast>["toast"]>[1]`. `ToastKind` is `"error" | "success" | "info"` and `"info"` is assignable directly; the cast is unnecessary and will silently fail to flag type drift if the signature changes. Not blocking, but worth removing.

### `accent-[var(--color-pink)]` color bypass — confirmed

Two inputs use the arbitrary class `accent-[var(--color-pink)]`: the `is_sealed` checkbox (`ListingForm` line 346) and the ANIMAL_OK / BIOGAS_ONLY radio buttons (`UnfitSection` line 906). `accent-pink` is not defined in `tailwind.config.ts`, so this bypasses the token system. The visual impact is minimal (browser fallback to default accent), but it violates the spec constraint.

### Redundant double-close on listing success — confirmed

```ts
// ListingForm.handleSubmit (lines 294–296)
onSuccess(res.id);   // parent: setConfirmedId(id); setDialogOpen(false); onRefresh()
onClose();           // parent: setDialogOpen(false) — again
```

React batches both `setDialogOpen(false)` calls into one render, so the current behavior is correct. The issue is contractual: `ListingForm` signals completion via both `onSuccess` and `onClose`, making it unclear which one the parent should use to close the dialog. `DonateDeliverySection` has the same pattern (`handleSuccess` calls `setOpen(false)`, then `ListingForm` calls `onClose={() => setOpen(false)}`).

</details>

---

<details>
<summary>File map</summary>

| File | Change |
|------|--------|
| `src/pages/Donor.tsx` | All five donor sections, reusable ConfirmationCard, CopyChip, StatusBadge, Dialog with focus trap, ListingForm with inline errors and client-side validation, hub toolbar with geolocation/nearest/cold-only |

Full diff: `git diff main -- src/pages/Donor.tsx`

</details>
