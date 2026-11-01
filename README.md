# Food Rescue

The project contains a React/Vite frontend and a FastAPI backend backed by
PostgreSQL.

## Requirements

- Node.js and npm
- Python 3.10 or later
- PostgreSQL, locally or remotely

## Configure and run

In PowerShell, configure the backend first:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` and set `DATABASE_URL` to your PostgreSQL connection URL.
Also replace `JWT_SECRET_KEY` with a private random value (for example, generate
one with `python -c "import secrets; print(secrets.token_urlsafe(32))"`).
`CORS_ORIGINS` is a comma-separated list of trusted frontend origins; its
example value permits the local Vite URLs.
Do not commit this file; it is ignored by Git. Then start the API from the
`backend` directory:

```powershell
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, install and start the frontend:

```powershell
cd frontend
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). The frontend
checks `http://localhost:8000/health`. The API also exposes `/health/db` to
check the PostgreSQL connection and `/docs` for interactive API documentation.

## Verify

```powershell
cd frontend
npm run lint
npm run build
```

The backend dependency list is in `backend/requirements.txt`; the frontend
dependencies and lockfile are in `frontend/package.json` and
`frontend/package-lock.json`.

## Test authentication and authorization

From the backend directory, install the test dependencies and run the isolated
API tests:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

These tests use an isolated in-memory SQLite database and cover authentication,
registration role escalation, privileged provisioning, Admin authorization and
audit logs, notification privacy, restaurant-owned history, listing search and
pagination, Stock Clearance claims and discount boundaries, and the
donation-to-volunteer-delivery workflow. They do not connect to the configured
PostgreSQL database.

For a manual check, start the API and open `/docs`. Register a user with
`POST /users/register`, log in with `POST /users/login`, copy the
`access_token`, then use **Authorize** to enter the token. Call
`GET /users/me` and confirm it returns the logged-in user. Calling that endpoint
without a token or with an invalid/expired token should return `401`.

Public registration creates community-user accounts only. Restaurant, NGO,
agent, school, and Admin accounts must be provisioned from a trusted backend
shell; there is no public privileged-registration endpoint. Account status and
role permissions are checked by the backend on every authenticated request.

### Provision privileged accounts

The CLI initializes missing application tables without resetting existing
records, prompts for the password without displaying it, and stores only a
password hash. Create the first Admin account once:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m provision_user --full-name "FoodRescue Admin" --email admin@example.com --role admin
```

The first Admin bootstrap is one-time and serialized on PostgreSQL. Admin
accounts cannot be created or assigned through public signup or Admin APIs.
The same CLI can provision other approved roles:

```powershell
python -m provision_user --full-name "Restaurant Account" --email restaurant@example.com --role restaurant
python -m provision_user --full-name "NGO Account" --email ngo@example.com --role ngo
python -m provision_user --full-name "Delivery Agent" --email agent@example.com --role agent
```

The provisioning action is written to the Admin audit log. Admins can search,
filter, sort, and page through users and listings; view claim/delivery records;
approve or reject accounts (a rejection requires a reason recorded with the
reviewer and timestamp); manage account status; change listing availability;
and review database-backed role, expiry, claim, delivery, quantity-by-unit,
and time-range trend reports. Restaurants can search, filter, sort, cancel, and
page through their own donation and Stock Clearance histories, including
unavailable or expired records and related claims. They can edit the title,
description, and pickup location of active, unclaimed listings; quantity,
pricing, expiry, and discount values remain server-controlled. Persistent in-app
notifications are generated for donation, claim, volunteer task acceptance,
delivery, and administrative status events.

The volunteer workflow separates accepting an open task from marking it
collected and delivered. Task records expose the donation's pickup location and
quantity. After an NGO saves a delivery point on its claim, only the assigned
volunteer can view that destination; open, unassigned tasks do not expose it.

New role-focused APIs include:

- `GET /restaurant/donations`, `GET /restaurant/stock-clearance`,
  `GET /restaurant/claims`, and
  `GET /restaurant/stock-clearance-claims` for authenticated owner history.
- `PATCH /restaurant/donations/{id}` and
  `PATCH /restaurant/stock-clearance/{id}` to cancel the restaurant's own
  listings without deleting history.
- `PUT /restaurant/donations/{id}` and
  `PUT /restaurant/stock-clearance/{id}` to edit eligible restaurant-owned
  listings.
- `POST /volunteer/tasks/{id}/accept` and
  `GET /volunteer/tasks/{id}` for authorized task acceptance and task details.
- `GET /admin/analytics` and `GET /admin/reports/impact?days=30` for Admin-only
  real-data statistics and trends.

The school role is retained for compatibility, but a dedicated school workflow
or APIs are not implemented. School accounts currently have a view-only
placeholder dashboard. Stock Clearance has no payment processor, and delivery
assignment remains a volunteer self-assignment of open tasks.

The application currently uses SQLAlchemy `create_all` plus a safe additive
startup migration for the audit actor field; it does not yet have a general
versioned migration framework. For production, introduce reviewed Alembic
migrations, configure production-only `CORS_ORIGINS` and `VITE_API_URL`, use a
managed PostgreSQL service, and verify backups and TLS before deployment.

## Pickup and delivery maps

The map uses Leaflet and React Leaflet with configurable OpenStreetMap-compatible
tiles. Donation pickup coordinates are nullable `pickup_latitude` and
`pickup_longitude` columns on `food_listings`; recipient address/coordinates and
the volunteer's opt-in live position are nullable fields on the existing
`food_claims` table. Startup applies additive columns for existing databases
without clearing existing records. Plan and test a versioned Alembic migration
before using this startup migration in a production deployment.

Restaurants select the pickup address and point on the map when creating a
donation. NGOs select and save the delivery point on their claim. An assigned
volunteer can explicitly start location sharing; browser permission is
requested only after that action, updates are sent at most once every 10 seconds,
and sharing stops (and the last location is cleared) when stopped, the task
screen closes, or delivery completes. Recipients, the assigned volunteer, and
Admins can see the delivery route; unassigned volunteers and donating
restaurants do not receive recipient coordinates.

Routes are requested server-side from the configurable OSRM-compatible
`ROUTING_BASE_URL`. Road distance and travel duration come from the provider.
The fastest returned route is distinguished from the shortest-distance route
among alternatives actually returned; the app does not request or claim a
shortest-route optimization. Google Maps opens separately for navigation.
Address lookup is server-side and optional via `GEOCODING_BASE_URL`, configured
as a Nominatim-compatible `/search` endpoint. Without it, users can enter the
address and select the point directly on the map. Tile, geocoding, and routing
service usage terms and limits apply.

The sample OSRM URL and default OpenStreetMap tiles are for development and are
not production service guarantees. Configure production-appropriate,
terms-compliant tile, geocoding, and routing providers. Environment:

- Backend: `ROUTING_BASE_URL`, optional `GEOCODING_BASE_URL`.
- Frontend: `VITE_MAP_TILE_URL` (URL template with `{s}`, `{z}`, `{x}`, `{y}`).

Install/start on Windows from the repository root:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Map workflow tests mock the OSRM-compatible response and use isolated SQLite;
they verify coordinate validation, owner/recipient/volunteer/Admin authorization,
route metrics and alternatives, missing-route behavior, live-location sharing,
and additive schema upgrades. They do not measure a real provider route or
replace a production PostgreSQL migration/integration test.

## Demonstration sequence

1. Provision an Admin using the command above and sign in at `/login`.
2. From separate trusted backend shells, provision restaurant, NGO, and agent
   accounts using the CLI commands. Register a community account through
   `/register`.
3. Sign in as the restaurant, publish a donation and a Stock Clearance offer,
   then verify the restaurant-owned histories show their availability, expiry,
   and claims.
4. Sign in as the NGO, search available donations, claim one, and review its
   claim and delivery status.
5. Sign in as the agent, accept an available task, mark it collected, then mark
   it delivered.
6. Sign in as the community user, browse and search Flash Deals, claim a
   quantity, and confirm the updated stock and private claim history.
7. Return to the Admin dashboard to review platform counts, account status,
   listings, claims, deliveries, impact reports, audit logs, and notifications.
