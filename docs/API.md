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
  - [Categories (`categories`)](#1-categories-categories)
  - [My Listings (`myListings`)](#2-my-listings-mylistings)
  - [Add Listing (`addListing`)](#3-add-listing-addlisting)
  - [Active Feed (`feed`)](#4-active-feed-feed)
  - [Claim Listing (`claim`)](#5-claim-listing-claim)
  - [My Claims (`myClaims`)](#6-my-claims-myclaims)
  - [Available Jobs & Slots (`jobs`)](#7-available-jobs--slots-jobs)
  - [Accept Job (`accept`)](#8-accept-job-accept)
  - [My Pickups (`myPickups`)](#9-my-pickups-mypickups)
  - [Deliver Pickup (`deliver`)](#10-deliver-pickup-deliver)
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

### 1. Categories (`categories`)
Returns all active food categories.

- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=categories`
- **Response Fields**: Array of:
  - `id`: number (`category_id`)
  - `name`: string (`category_name`)

### 2. My Listings (`myListings`)
Returns all listings created by the logged-in donor.

- **Role Required**: `DONOR`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=myListings`
- **Response Fields**: Array of:
  - `listing_id`: number
  - `food_name`: string
  - `status`: string
  - `expires_at`: ISO timestamp string
  - `quantity_unit`: string
  - `quantity_remaining`: number

### 3. Add Listing (`addListing`)
Publishes a new surplus food listing, creates an initial passing visual safety check, and computes match scores.

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
    "storage": "HOT"
  }
  ```
- **Response Fields**:
  - `id`: number (Created `listing_id`)

### 4. Active Feed (`feed`)
Returns active available listings sorted by match score for the authenticated recipient.

- **Role Required**: `RECIPIENT`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=feed`
- **Response Fields**: Array of:
  - `listing_id`: number
  - `food_name`: string
  - `donor_name`: string
  - `tags`: string
  - `quantity_remaining`: number
  - `quantity_unit`: string
  - `minutes_left`: number
  - `score`: number | null

### 5. Claim Listing (`claim`)
Places a claim for surplus food. Triggers database validation (stock, capacity, expiry, diet restrictions).

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
- **Response Fields**:
  - `ok`: number (`1`)

### 6. My Claims (`myClaims`)
Returns claims made by the authenticated recipient.

- **Role Required**: `RECIPIENT`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=myClaims`
- **Response Fields**: Array of:
  - `claim_id`: number
  - `food_name`: string
  - `quantity_claimed`: number
  - `claim_status`: string
  - `pickup_status`: string | null

### 7. Available Jobs & Slots (`jobs`)
Returns unassigned delivery jobs and available delivery slots for volunteers.

- **Role Required**: `VOLUNTEER`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=jobs`
- **Response Fields**:
  - `jobs`: Array of:
    - `claim_id`: number
    - `food_name`: string
    - `quantity_claimed`: number
    - `pickup_from`: string (Donor address)
    - `deliver_to`: string (Recipient address)
  - `slots`: Array of:
    - `slot_id`: number
    - `slot_date`: string
    - `start_time`: string
    - `pickup_area`: string

### 8. Accept Job (`accept`)
Assigns a volunteer to a delivery claim and delivery slot.

- **Role Required**: `VOLUNTEER`
- **Method**: `POST`
- **Query Parameter**: `a=accept`
- **Request Body**:
  ```json
  {
    "claim_id": 15,
    "slot_id": 3
  }
  ```
- **Response Fields**:
  - `ok`: number (`1`)

### 9. My Pickups (`myPickups`)
Returns pickups assigned to the logged-in volunteer.

- **Role Required**: `VOLUNTEER`
- **Method**: `GET` (or `POST`)
- **Query Parameter**: `a=myPickups`
- **Response Fields**: Array of:
  - `pickup_id`: number
  - `food_name`: string
  - `pickup_status`: string
  - `pickup_from`: string
  - `deliver_to`: string

### 10. Deliver Pickup (`deliver`)
Marks an assigned pickup as delivered. Triggers claim completion and impact record generation.

- **Role Required**: `VOLUNTEER`
- **Method**: `POST`
- **Query Parameter**: `a=deliver`
- **Request Body**:
  ```json
  {
    "pickup_id": 8
  }
  ```
- **Response Fields**:
  - `ok`: number (`1`)

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
