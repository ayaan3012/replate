# Surplus Food Rescue API Documentation

All endpoints are hosted as Vercel serverless functions under `/api`. Standard responses are returned as JSON. Errors return an HTTP status code (typically `400`, `401`, `404`, or `405`) with a body format `{ "error": "<message>" }`.

---

## Table of Contents

- [Authentication & User Management (`/api/auth`)](#authentication--user-management-apiauth)
  - [Get Current User (`me`)](#1-get-current-user-me)
  - [Logout (`logout`)](#2-logout-logout)
  - [Login (`login`)](#3-login-login)
  - [Register (`register`)](#4-register-register)
- [Geolocation Services (`/api/geo`)](#geolocation-services-apigeo)
  - [Geocode Address (`geocode`)](#1-geocode-address-geocode)
- [Data & Operations (`/api/data`)](#data--operations-apidata)
  - [Profile (`profile`)](#1-profile-profile)
  - [Categories (`categories`)](#2-categories-categories)
  - [Tags (`tags`)](#3-tags-tags)
  - [Add Listing (`addListing`)](#4-add-listing-addlisting)
  - [Report Unfit (`reportUnfit`)](#5-report-unfit-reportunfit)
  - [My Listings (`myListings`)](#6-my-listings-mylistings)
  - [My Routings (`myRoutings`)](#7-my-routings-myroutings)
  - [My Impact — Donor (`myImpact`)](#8-my-impact-myimpact--donor)
  - [Active Feed (`feed`)](#9-active-feed-feed)
  - [Claim Listing (`claim`)](#10-claim-listing-claim)
  - [My Claims (`myClaims`)](#11-my-claims-myclaims)
  - [My Impact — Recipient (`myImpact`)](#12-my-impact-myimpact--recipient)
  - [Available Jobs (`jobs`) — Food](#13-available-jobs-jobs--volunteer--food)
  - [Accept Job (`accept`) — Food](#14-accept-job-accept--volunteer--food)
  - [Set Pickup Status (`setStatus`)](#15-set-pickup-status-setstatus--volunteer--food)
  - [My Pickups (`myPickups`)](#16-my-pickups-mypickups--volunteer--food)
  - [Waste Jobs (`wasteJobs`)](#17-waste-jobs-wastejobs--volunteer--waste)
  - [Waste Slots (`wasteSlots`)](#18-waste-slots-wasteslots--volunteer--waste)
  - [Containers (`containers`)](#19-containers-containers--volunteer--waste)
  - [Collect Waste (`collect`)](#20-collect-waste-collect--volunteer--waste)
  - [My Collections (`myCollections`)](#21-my-collections-mycollections--volunteer--waste)
  - [My Impact — Volunteer (`myImpact`)](#22-my-impact-myimpact--volunteer)
- [Hub Management (`/api/hubs`)](#hub-management-apihubs)
  - [List Hubs (`list`)](#1-list-hubs-list)
  - [Nearest Hubs (`nearest`)](#2-nearest-hubs-nearest)
  - [Hub Check-in (`checkin`)](#3-hub-check-in-checkin)
  - [Hub Kiosk (`kiosk`)](#4-hub-kiosk-kiosk)
- [Shared Utilities (`lib/util.js`)](#shared-utilities-libutiljs)

---

## Authentication & User Management (`/api/auth`)

### 1. Get Current User (`me`)
Returns the currently authenticated user's profile information from the JWT session cookie `t`.

- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=me`
- **Headers**: `Cookie: t=<jwt_token>`
- **Request Body**: None
- **Response Fields**:
  - `user`: Object or `null`
    - `id`: number (User ID from `APP_USER.user_id`)
    - `role`: string (`"DONOR"` | `"RECIPIENT"` | `"VOLUNTEER"`)
    - `pid`: number (Profile ID: `donor_id`, `recipient_id`, or `volunteer_id`)
    - `name`: string (Profile display name)

### 2. Logout (`logout`)
Clears the session cookie `t`.

- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=logout`
- **Request Body**: None
- **Response Header**: Sets `Set-Cookie: t=; Path=/; Max-Age=0`
- **Response Fields**:
  - `ok`: number (`1`)

### 3. Login (`login`)
Authenticates an existing user by email, role, and password. Sets an HttpOnly JWT cookie `t` upon success.

- **Method**: `POST`
- **Query Parameter**: `a=login`
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "secretpassword",
    "role": "DONOR"
  }
  ```
  - `email` (string, required): Registered user email.
  - `password` (string, required): Plaintext password.
  - `role` (string, required): One of `"DONOR"`, `"RECIPIENT"`, `"VOLUNTEER"`.
- **Response Fields**:
  - `user`: Object
    - `id`: number (`APP_USER.user_id`)
    - `role`: string (`"DONOR"` | `"RECIPIENT"` | `"VOLUNTEER"`)
    - `pid`: number (Profile ID in matching table)
    - `name`: string (User/Entity name)

### 4. Register (`register`)
Creates a new entity profile (`DONOR`, `RECIPIENT`, or `VOLUNTEER`) and matching `APP_USER` record inside a database transaction. Automatically geocodes the given address via OpenStreetMap Nominatim (fallback coordinates: `28.6139, 77.2090`). Sets the session cookie upon success.

- **Method**: `POST`
- **Query Parameter**: `a=register`
- **Request Body**:
  - **Common fields**:
    - `name` (string, required): Full name / organization name.
    - `email` (string, required): Email address (must be unique in `APP_USER`).
    - `phone` (string, required): Contact phone number.
    - `password` (string, required): Password (minimum 6 characters).
    - `role` (string, required): One of `"DONOR"`, `"RECIPIENT"`, `"VOLUNTEER"`.
  - **Role-specific fields**:
    - **DONOR** (`role: "DONOR"`):
      - `type` / `donor_type` (string, optional): `"RESTAURANT"`, `"HOTEL"`, `"CATERER"`, `"EVENT_ORGANISER"`, `"SHOP"` (default: `"RESTAURANT"`).
      - `address` (string, optional): Physical address to geocode (default: `"Delhi"`).
    - **RECIPIENT** (`role: "RECIPIENT"`):
      - `type` / `recipient_type` (string, optional): `"NGO"`, `"SHELTER"`, `"ORPHANAGE"`, `"COMMUNITY_KITCHEN"`, `"OLD_AGE_HOME"` (default: `"NGO"`).
      - `address` (string, optional): Facility address to geocode (default: `"Delhi"`).
      - `daily_capacity` (number, optional): Maximum meals/units accepted daily (default: `50`).
      - `has_cold_storage` (boolean, optional): Whether facility has cold storage (default: `false`).
    - **VOLUNTEER** (`role: "VOLUNTEER"`):
      - `type` / `vehicle_type` (string, optional): `"WALK"`, `"BIKE"`, `"SCOOTER"`, `"CAR"`, `"VAN"` (default: `"BIKE"`).
      - `vrole` (string, optional): Volunteer task preference (`"FOOD_ONLY"`, `"WASTE_ONLY"`, or `"DUAL"`, default: `"FOOD_ONLY"`).
      - `address` / `home_address` (string, optional): Home address to geocode for volunteer base coordinates.
      - `service_radius_km` (number, optional): Max delivery service radius in km (default: `10`).
- **Response Fields**:
  - `user`: Object
    - `id`: number (`APP_USER.user_id`)
    - `role`: string
    - `pid`: number (Profile ID)
    - `name`: string

---

## Geolocation Services (`/api/geo`)

### 1. Geocode Address (`geocode`)
Geocodes an address string to latitude and longitude coordinates in India (`countrycodes=in`) using OpenStreetMap Nominatim. Features in-memory caching and strict 1-request-per-second throttling. No login required.

- **Method**: `GET`
- **Query Parameters**:
  - `a=geocode`: Action identifier.
  - `q=<address>`: Search query/address string.
- **Authentication**: None required.
- **Success Response (200 OK)**:
  ```json
  {
    "lat": 28.6139,
    "lng": 77.2090
  }
  ```
  - `lat`: number (Latitude float)
  - `lng`: number (Longitude float)
- **Error Response (404 Not Found)**:
  ```json
  {
    "error": "Address not found"
  }
  ```

---

## Data & Operations (`/api/data`)

Requires authentication (`t` session cookie). Returns 401 if not logged in.

### 1. Profile (`profile`)
Returns the logged-in user's own profile fields. Always includes a `role` field so the UI knows which tabs to show.

- **Role Required**: Any (`DONOR`, `RECIPIENT`, `VOLUNTEER`)
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=profile`
- **Response Fields** (all roles):
  - `name`: string
  - `address`: string
  - `latitude`: number
  - `longitude`: number
  - `type`: string (role-specific type: `donor_type`, `recipient_type`, or `vehicle_type`)
  - `role`: string (`"DONOR"` | `"RECIPIENT"` | `"VOLUNTEER"`)
- **Additional fields for `VOLUNTEER`**:
  - `vrole`: string (`"FOOD_ONLY"` | `"WASTE_ONLY"` | `"DUAL"`) — determines which tabs the UI shows
  - `service_radius_km`: number

### 2. Categories (`categories`)
Returns all food categories.

- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=categories`
- **Response Fields**: Array of:
  - `id`: number (`category_id`)
  - `name`: string (`category_name`)

### 3. Tags (`tags`)
Returns all tags (diet and allergen).

- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=tags`
- **Response Fields**: Array of:
  - `id`: number (`tag_id`)
  - `name`: string (`tag_name`)
  - `type`: string (`DIET` or `ALLERGEN`)

### 4. Add Listing (`addListing`)
Publishes a new surplus food listing in a single transaction: inserts the listing, attaches diet and allergen tags, inserts an initial passing safety check (which fires the trigger to set status `AVAILABLE`), then calls `sp_compute_match_scores` after commit.

- **Role Required**: `DONOR`
- **Method**: `POST`
- **Query Parameter**: `a=addListing`
- **Request Body**:
  ```json
  {
    "category_id": 1,
    "food_name": "Paneer Rice Bowls",
    "qty": 20,
    "unit": "plates",
    "weight": 0.4,
    "hours": 4,
    "storage": "HOT",
    "is_sealed": false,
    "hub_id": null,
    "tag_ids": [3, 7],
    "allergens": [
      { "tag_id": 12, "contains": true },
      { "tag_id": 15, "contains": false }
    ]
  }
  ```
  - `category_id` (number, required)
  - `food_name` (string, required)
  - `qty` (number, required): Total quantity.
  - `unit` (string, required): Unit label (e.g. `"plates"`, `"kg"`).
  - `weight` (number, required): Weight per unit in kg.
  - `hours` (number, required): Hours until expiry (`expires_at = NOW() + INTERVAL hours HOUR`).
  - `storage` (string, required): `"HOT"`, `"AMBIENT"`, or `"REFRIGERATED"`. **`"HOT"` is rejected for hub listings.**
  - `is_sealed` (boolean, optional): Whether units are sealed. Forced to `true` for hub listings.
  - `hub_id` (number, optional): Hub to route the food through. If provided, `storage` must not be `"HOT"` and `is_sealed` is forced to `1`.
  - `tag_ids` (array of numbers, optional): Diet tag IDs — inserted into `LISTING_TAG` with `contains_flag=1`.
  - `allergens` (array, optional): Each element `{ tag_id, contains: true|false }` — inserted with the given `contains_flag`.
- **Safety check**: `VISUAL` for direct donations; `SEAL` for hub listings. Stage is `LISTING`, result is `PASS`.
- **Response Fields**:
  - `id`: number (Created `listing_id`)

### 5. Report Unfit (`reportUnfit`)
Records food that is not fit for human consumption and routes it to the best available partner. Runs in a single transaction.

- **Role Required**: `DONOR`
- **Method**: `POST`
- **Query Parameter**: `a=reportUnfit`
- **Request Body**:
  ```json
  {
    "category_id": 2,
    "food_name": "Stale bread",
    "qty": 30,
    "unit": "loaves",
    "weight": 0.3,
    "grade": "ANIMAL_OK"
  }
  ```
  - `category_id` (number, required)
  - `food_name` (string, required)
  - `qty` (number, required)
  - `unit` (string, required)
  - `weight` (number, required): kg per unit.
  - `grade` (string, required): `"ANIMAL_OK"` or `"BIOGAS_ONLY"`.
- **Partner selection** (`kg = qty × weight`):
  - `ANIMAL_OK` → `fn_pick_partner('FARM', category_id, kg)`, fallback `fn_pick_partner('ANIMAL_SHELTER', category_id, kg)`.
  - `BIOGAS_ONLY` → `fn_pick_partner('BIOGAS', category_id, kg)`.
  - If no partner is found, the transaction is rolled back and `400 { "error": "No partner accepts this food right now" }` is returned.
- **Transaction steps**:
  1. `INSERT FOOD_LISTING` (storage `AMBIENT`, `ready_at = NOW()-2h`, `expires_at = NOW()-1h`).
  2. `INSERT WASTE_ROUTING` (listing_id, route_type from partner's `partner_type`, partner_id, grade, kg).
  3. `UPDATE FOOD_LISTING SET status='ROUTED'`.
- **Response Fields**:
  - `partner_name`: string
  - `route_type`: string (the partner's `partner_type`)
  - `kg`: number

### 6. My Listings (`myListings`)
Returns all listings created by the logged-in donor, including hub handover details for hub listings.

- **Role Required**: `DONOR`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=myListings`
- **Response Fields**: Array of:
  - `listing_id`: number
  - `food_name`: string
  - `status`: string
  - `expires_at`: ISO timestamp string
  - `quantity_unit`: string
  - `quantity_remaining`: number (from `v_listing_remaining`)
  - `storage_type`: string
  - `hub_name`: string | null
  - `handovers`: Array (empty for non-hub listings), each element:
    - `handover_id`: number
    - `claim_id`: number
    - `recipient_name`: string
    - `quantity_claimed`: number
    - `status`: string
    - `compartment_label`: string
    - `drop_code`: string | null — 6-digit code (from `makeCode(claim_id, 'drop')`) **only** when status is `AWAITING_DROP`; `null` otherwise.

### 7. My Routings (`myRoutings`)
Returns all waste routing records for the logged-in donor's listings.

- **Role Required**: `DONOR`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=myRoutings`
- **Response Fields**: Array of:
  - `food_name`: string
  - `route_type`: string (partner type)
  - `partner_name`: string
  - `quantity_kg`: number
  - `status`: string

### 8. My Impact (`myImpact`) — Donor
Returns the donor's impact summary from the `v_donor_impact` view. Returns zeroed values if no impact row exists yet.

- **Role Required**: `DONOR`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=myImpact`
- **Response Fields**:
  - `meals_saved`: number
  - `kg_diverted`: number
  - `co2_avoided_kg`: number
  - `trust_score`: number

### 9. Active Feed (`feed`)
Returns active listings that this recipient can actually receive, filtered by dietary compatibility and cold-storage capability.

- **Role Required**: `RECIPIENT`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=feed`
- **Optional Query Parameter**: `hub_id=<number>` — filter to listings at a specific hub.
- **Filtering logic**:
  - `fn_listing_meets_needs(listing_id, recipient_id) = 1` (diet/allergen compatibility).
  - `storage_type NOT IN ('REFRIGERATED','FROZEN')` OR the recipient's `has_cold_storage = 1`.
- **Response Fields**: Array of:
  - `listing_id`: number
  - `food_name`: string
  - `donor_name`: string
  - `tags`: string
  - `quantity_remaining`: number
  - `quantity_unit`: string
  - `minutes_left`: number
  - `storage_type`: string
  - `hub_id`: number | null
  - `hub_name`: string | null
  - `score`: number | null

### 10. Claim Listing (`claim`)
Places a claim for surplus food in a single transaction. For hub listings, also allocates a compartment and creates a `HUB_HANDOVER` row with hashed drop/pickup codes.

- **Role Required**: `RECIPIENT`
- **Method**: `POST`
- **Query Parameter**: `a=claim`
- **Request Body**:
  ```json
  {
    "listing_id": 12,
    "qty": 5
  }
  ```
- **Hub listings**: finds the best-fit compartment from `v_hub_status` where `temp_controlled` matches `REFRIGERATED`/`FROZEN` storage, `free_kg >= qty × weight_per_unit_kg`, and `accepting = 1` (most free first). Returns `400 { "error": "This hub cannot take the food right now" }` if none found.
- **Response Fields**:
  - `claim_id`: number
  - `handover_id`: number | null (null for non-hub listings)
  - `hub_name`: string | null
  - `compartment`: string | null (compartment label, e.g. `"A1"`)
  - `pickup_code`: string | null (6-digit code — shown to recipient once; used at the kiosk to collect)

### 11. My Claims (`myClaims`)
Returns all claims made by the authenticated recipient, including hub handover details and the pickup code when applicable.

- **Role Required**: `RECIPIENT`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=myClaims`
- **Response Fields**: Array of:
  - `claim_id`: number
  - `food_name`: string
  - `donor_name`: string
  - `quantity_claimed`: number
  - `claim_status`: string
  - `pickup_status`: string | null (volunteer delivery status)
  - `volunteer_name`: string | null
  - `handover_id`: number | null
  - `handover_status`: string | null
  - `hub_name`: string | null
  - `compartment_label`: string | null
  - `pickup_code`: string | null — 6-digit code (`makeCode(claim_id, 'pickup')`) **only** when `handover_status` is `AWAITING_DROP` or `DROPPED`; `null` otherwise.

### 12. My Impact (`myImpact`) — Recipient
Returns this recipient's impact summary: count of completed claims, total kg received, and meals received, aggregated from `IMPACT_RECORD` rows linked via `PICKUP` or `HUB_HANDOVER`.

- **Role Required**: `RECIPIENT`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=myImpact`
- **Response Fields**:
  - `claims_completed`: number
  - `kg_received`: number
  - `meals_received`: number

> **Note**: `myImpact` also works for `DONOR` (see [§8](#8-my-impact-myimpact--donor)) — the response shape differs by role.

### 13. Available Jobs (`jobs`) — Volunteer / Food
Returns claimable food delivery jobs for this volunteer, each with a pre-filtered list of eligible slots. Calls `sp_ensure_slots(7)` to seed the next 7 days of slots before querying.

- **Role Required**: `VOLUNTEER` with `vrole` `FOOD_ONLY` or `DUAL`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=jobs`
- **Job filtering**:
  - `claim_status IN ('PENDING','APPROVED')`
  - `hub_id IS NULL` (direct deliveries only)
  - `expires_at > NOW()`
  - No existing `PICKUP` in status `SCHEDULED`, `ACCEPTED`, `IN_TRANSIT`, or `DELIVERED`
- **Slot filtering** (per job):
  - `run_type = 'FOOD'`, `TIMESTAMP(slot_date, start_time) > NOW()`
  - `TIMESTAMP(slot_date, end_time) <= listing.expires_at`
  - Within recipient's `receiving_from` / `receiving_until` window (when set)
  - Free capacity: active pickups < `capacity`
  - `fn_volunteer_slot_conflict(volunteer_id, slot_id) = 0`
- **Response Fields**: Array sorted by `distance_km`, each element:
  - `claim_id`: number
  - `food_name`: string
  - `quantity_claimed`: number
  - `pickup_from`: string (donor address)
  - `deliver_to`: string (recipient address)
  - `expires_at`: ISO timestamp
  - `distance_km`: number (Haversine via `fn_distance_km` from volunteer home to donor)
  - `within_radius`: boolean (`distance_km <= service_radius_km`)
  - `slots`: Array of:
    - `slot_id`: number
    - `slot_date`: string
    - `start_time`: string
    - `end_time`: string

### 14. Accept Job (`accept`) — Volunteer / Food
Assigns this volunteer to a food delivery claim and slot.

- **Role Required**: `VOLUNTEER` with `vrole` `FOOD_ONLY` or `DUAL`
- **Method**: `POST`
- **Query Parameter**: `a=accept`
- **Request Body**:
  ```json
  { "claim_id": 15, "slot_id": 3 }
  ```
- **Response Fields**:
  - `ok`: number (`1`)
  - `pickup_id`: number (newly created `PICKUP` row)

### 15. Set Pickup Status (`setStatus`) — Volunteer / Food
Updates the status of a pickup owned by this volunteer.

- **Role Required**: `VOLUNTEER`
- **Method**: `POST`
- **Query Parameter**: `a=setStatus`
- **Request Body**:
  ```json
  {
    "pickup_id": 8,
    "status": "IN_TRANSIT",
    "failure_reason": null
  }
  ```
  - `status` (string, required): `"IN_TRANSIT"`, `"DELIVERED"`, or `"FAILED"`.
  - `failure_reason` (string, required when `status` is `"FAILED"`): one of `"FOOD_UNSAFE"`, `"RECIPIENT_UNAVAILABLE"`, `"VEHICLE_BREAKDOWN"`, `"OTHER"`.
- **Response Fields**:
  - `ok`: number (`1`)

### 16. My Pickups (`myPickups`) — Volunteer / Food
Returns all pickups assigned to the logged-in volunteer.

- **Role Required**: `VOLUNTEER`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=myPickups`
- **Response Fields**: Array of:
  - `pickup_id`: number
  - `food_name`: string
  - `quantity_claimed`: number
  - `pickup_status`: string
  - `pickup_from`: string (donor address)
  - `deliver_to`: string (recipient address)
  - `slot_date`: string | null
  - `start_time`: string | null
  - `end_time`: string | null
  - `delivered_at`: ISO timestamp | null

### 17. Waste Jobs (`wasteJobs`) — Volunteer / Waste
Returns all unassigned waste routings available for collection.

- **Role Required**: `VOLUNTEER` with `vrole` `WASTE_ONLY` or `DUAL`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=wasteJobs`
- **Filtering**: `status = 'PENDING'` and `collection_id IS NULL`
- **Response Fields**: Array of:
  - `waste_id`: number (`routing_id`)
  - `food_name`: string
  - `donor_address`: string
  - `quantity_kg`: number
  - `condition_grade`: string (`ANIMAL_OK` or `BIOGAS_ONLY`)
  - `route_type`: string (partner type)
  - `partner_id`: number
  - `partner_name`: string
  - `partner_address`: string

### 18. Waste Slots (`wasteSlots`) — Volunteer / Waste
Returns available waste-run slots for this volunteer. Calls `sp_ensure_slots(7)` first.

- **Role Required**: `VOLUNTEER` with `vrole` `WASTE_ONLY` or `DUAL`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=wasteSlots`
- **Filtering**: `run_type = 'WASTE'`, `slot_date >= CURDATE()`, `TIMESTAMP(slot_date, start_time) > NOW()`, free capacity (WASTE_COLLECTION count < capacity), `fn_volunteer_slot_conflict = 0`
- **Response Fields**: Array of:
  - `slot_id`: number
  - `slot_date`: string
  - `start_time`: string
  - `end_time`: string
  - `capacity`: number
  - `booked`: number (current booking count)

### 19. Containers (`containers`) — Volunteer / Waste
Returns all waste containers available for waste collection runs.

- **Role Required**: `VOLUNTEER`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=containers`
- **Response Fields**: Array of:
  - `container_id`: number
  - `container_label`: string
  - `container_type`: string
  - `capacity_kg`: number

### 20. Collect Waste (`collect`) — Volunteer / Waste
Records a waste collection run in a single transaction. All `waste_ids` must belong to the same partner. A database trigger marks each linked `WASTE_ROUTING` row as `COMPLETED`.

- **Role Required**: `VOLUNTEER` with `vrole` `WASTE_ONLY` or `DUAL`
- **Method**: `POST`
- **Query Parameter**: `a=collect`
- **Request Body**:
  ```json
  {
    "waste_ids": [3, 4, 5],
    "slot_id": 7,
    "container_id": 2,
    "vehicle_no": "DL01AB1234",
    "weighed_kg": 42.5
  }
  ```
  - `waste_ids` (array of numbers, required): `WASTE_ROUTING.routing_id` values — must all share the same `partner_id` and have `status = 'PENDING'`.
  - `slot_id` (number, required)
  - `container_id` (number, required)
  - `vehicle_no` (string, required)
  - `weighed_kg` (number, required): Actual measured weight.
- **Transaction steps**:
  1. Validate all `waste_ids` share exactly one partner; rollback if not.
  2. `INSERT WASTE_COLLECTION` with `source_type = 'DONOR_SITE'` and `receipt_ref = 'RCPT-<partner_id>-<timestamp>'`.
  3. `UPDATE WASTE_ROUTING SET collection_id = <new id>` for all matching pending rows (trigger sets `status = 'COMPLETED'`).
- **Response Fields**:
  - `ok`: number (`1`)
  - `collection_id`: number
  - `receipt_ref`: string

### 21. My Collections (`myCollections`) — Volunteer / Waste
Returns all waste collection runs completed by this volunteer.

- **Role Required**: `VOLUNTEER`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=myCollections`
- **Response Fields**: Array of:
  - `collection_id`: number
  - `partner_name`: string
  - `weighed_kg`: number
  - `receipt_ref`: string
  - `collected_at`: ISO timestamp

### 22. My Impact (`myImpact`) — Volunteer
Returns this volunteer's cumulative delivery and waste impact. (Also available for `DONOR` §8 and `RECIPIENT` §12 with different shapes.)

- **Role Required**: `VOLUNTEER`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=myImpact`
- **Response Fields**:
  - `deliveries_completed`: number
  - `kg_delivered`: number
  - `meals_delivered`: number
  - `waste_kg_collected`: number

---

## Hub Management (`/api/hubs`)

No authentication required for `list` and `nearest`. `checkin` and `kiosk` are public-facing hub operations (steward check-in and vending-machine kiosk).

Uses the view `v_hub_status` (one row per compartment: `compartment_id`, `hub_id`, `hub_name`, `address`, `hub_type`, `latitude`, `longitude`, `hub_status`, `label`, `temp_controlled`, `max_weight_kg`, `free_kg`, `accepting`).

### 1. List Hubs (`list`)
Returns all hubs with their compartments, optionally sorted by distance to a given point.

- **Method**: `GET`
- **Query Parameters**:
  - `a=list`: Action identifier.
  - `lat` (number, optional): Latitude for distance calculation.
  - `lng` (number, optional): Longitude for distance calculation.
- **Response Fields**: Array of hub objects:
  - `hub_id`: number
  - `name`: string (hub name)
  - `address`: string
  - `hub_type`: string
  - `latitude`: number
  - `longitude`: number
  - `status`: string (hub status)
  - `distance_km`: number (only present when `lat` and `lng` are provided; rounded to 1 decimal, computed via `fn_distance_km`)
  - `available_items`: number (count of `FOOD_LISTING` rows with this `hub_id`, status `'AVAILABLE'` and `expires_at > NOW()`)
  - `compartments`: Array of:
    - `compartment_id`: number
    - `label`: string
    - `temp_controlled`: boolean/number
    - `free_kg`: number
    - `accepting`: boolean/number

### 2. Nearest Hubs (`nearest`)
Returns the 3 closest hubs with status `'ACTIVE'`, same shape as `list`.

- **Method**: `GET`
- **Query Parameters**:
  - `a=nearest`: Action identifier.
  - `lat` (number, required): Latitude.
  - `lng` (number, required): Longitude.
- **Response Fields**: Array of up to 3 hub objects (same shape as `list`, always includes `distance_km`).
- **Error Response (400)**:
  ```json
  { "error": "lat and lng are required" }
  ```

### 3. Hub Check-in (`checkin`)
Demo steward check-in. Calls `sp_hub_checkin(hub_id, temp)`.

- **Method**: `POST`
- **Query Parameter**: `a=checkin`
- **Request Body**:
  ```json
  {
    "hub_id": 1,
    "temp": 3.5
  }
  ```
  - `hub_id` (number, required): Hub to check in.
  - `temp` (number, optional): Temperature reading (default: `3.5`).
- **Response Fields**:
  - `ok`: boolean (`true`)
- **Error Response (400)**: `{ "error": "hub_id is required" }`

### 4. Hub Kiosk (`kiosk`)
Hub vending-machine kiosk endpoint for drop-off and pick-up code verification.

- **Method**: `POST`
- **Query Parameter**: `a=kiosk`
- **Request Body**:
  ```json
  {
    "handover_id": 5,
    "code": "123456"
  }
  ```
  - `handover_id` (number, required): The `HUB_HANDOVER` row to operate on.
  - `code` (string, required): 6-digit verification code entered by the user.
- **Logic**:
  1. Loads the `HUB_HANDOVER` row joined with `HUB_COMPARTMENT` for the compartment label. Returns `404` if not found.
  2. **Status `LOCKED`** → `400 { "error": "Locked after 3 wrong codes. Ask the hub steward." }`
  3. **Status `AWAITING_DROP`** → compares `hash(code)` with `drop_code_hash`:
     - Match → sets status to `DROPPED`, returns:
       ```json
       {
         "action": "DROP_OK",
         "compartment": "A1",
         "message": "Compartment A1 unlocked. Place the food inside and close the door."
       }
       ```
     - Mismatch → increments `failed_attempts`, returns `400 { "error": "Wrong code. N attempts left." }`
  4. **Status `DROPPED`** → compares `hash(code)` with `pickup_code_hash`:
     - Match → sets status to `COLLECTED`, returns:
       ```json
       {
         "action": "COLLECT_OK",
         "compartment": "A1",
         "message": "Compartment A1 unlocked. Take your food."
       }
       ```
     - Mismatch → increments `failed_attempts`, returns `400 { "error": "Wrong code. N attempts left." }`
  5. **Any other status** → `400 { "error": "Nothing to do for this order (status X)." }`
- **Note**: A database trigger locks the handover at 3 failed attempts. Trigger error messages are returned as-is.

---

## Shared Utilities (`lib/util.js`)

Exported utilities available to serverless API functions:

- `pool`: MySQL promise pool configured with `timezone: '+05:30'`, executing `SET time_zone='+05:30'` on each new connection.
- `user(req)`: Extracts and verifies JWT from `req.headers.cookie`. Returns user payload `{ id, role, pid, name }` or `null`.
- `sign(res, u)`: Issues a 7-day HttpOnly cookie `t` encoding user payload `u`.
- `errJson(e)`: Formats error objects into `{ error: e.sqlMessage || e.message }`.
- `hash(code)`: Generates a SHA-256 hex string from `code`.
- `makeCode(claimId, kind)`: Generates a deterministic 6-digit zero-padded verification code for `'drop'` or `'pickup'` using HMAC-SHA256 with `process.env.JWT_SECRET`. Automatically offsets pickup code (`(pickup + 1) % 1000000`) if it matches drop code.
- `geocode(address)`: Queries OpenStreetMap Nominatim (`countrycodes=in`) using `User-Agent: FoodRescueApp/1.0 (<NOMINATIM_EMAIL>)`. Returns `{ lat, lng }` or `null`. Includes in-memory caching and a 1 request/second rate limiter.
