# RentMall

RentMall is a local rental marketplace. This supervisor demo opens with Sahiwal and shows Lahore and Faisalabad as coming soon.

## Project folders

| Folder | Contents |
| --- | --- |
| `frontend/src/features/marketplace/` | Catalog, listings, photos, and rental forms |
| `frontend/src/features/account/` | Sign-in, profile access, and profile photos |
| `frontend/src/api/`, `frontend/src/components/` | API request hook and reusable dialog |
| `frontend/public/` | Static images and photo credits |
| `backend/src/accounts/`, `backend/src/listings/` | Express routes and MongoDB models |
| `backend/scripts/`, `backend/test/` | Database checks, legacy Firestore migration, and API tests |
| `shared/` | Catalog definitions, search rules, and profile validation |

Run the project-wide commands from the RentMall root. Both subfolders use the root npm workspace and lockfile.

## Run the demo

Use Node.js 24.12 or later. In Windows PowerShell, from the project folder:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open http://127.0.0.1:5173/. Vite proxies API requests to Express on port 4000.

| Command | What it runs |
| --- | --- |
| `npm.cmd run dev` | Website and API together |
| `npm.cmd run server` | API with automatic reload and the configured Atlas connection |
| `npm.cmd run dev:web` | Website only, with a separately running API |
| `npm.cmd run db:check` | Atlas connection check |
| `npm.cmd run check` | Lint, API tests, and the production frontend build |

## Walk through the demo

- Use city selection, category shortcuts, keyword search, the rate-unit and price filters, or Saved to browse the catalog.
- Choose **Rent something out**. Fill in the details, choose a category and rate unit, add up to five photos, and leave the account type as individual or switch it to business. Choose **Place ad**, review the policies, and accept them. The confirmation links to your new listing.
- Open a listing and choose **Rent this** to enter a start date and duration, see the estimated price, and save a demo request.

Guests can browse and search. Sign in to open ad details, save listings, post ads, or make demo requests. Open My profile to see My ads.

## Accounts and profiles

1. In Firebase, add a web app and enable **Authentication → Sign-in method → Email/Password**. Add the web host and local test host to authorized domains as needed for password-reset links.
2. Copy `frontend/.env.example` to `frontend/.env.local` if the file does not exist. Use the four Firebase web config values for the sign-in project. Set `VITE_API_URL` to the HTTPS API origin for a hosted build, or leave it blank for the local Vite proxy.
3. In Atlas, create the `rentmall` database connection with a database user scoped to that database. Permit the machine or hosting service that runs the API to connect.
4. Copy `backend/.env.example` to `backend/.env`. Set `MONGODB_URI` and `FIREBASE_PROJECT_ID`. Configure Firebase Admin Application Default Credentials. When using a service-account key, keep the file outside the project and point `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path. On the hosted API, use the host's secret settings. For deployed API access, set `ALLOWED_ORIGINS` to the exact frontend origin and set `HOST=0.0.0.0`.
5. Start the project. Open **Sign in**, create a test account, and complete the individual or business profile. Sign out and sign back in to check that it was saved. Test password recovery with an inbox you control.

Firebase handles sign-in and passwords. The Express API uses the verified Firebase user ID for MongoDB records. MongoDB stores profiles, profile photos, listings, listing photos, availability, saved listings, and demo rental requests. Account data requires a verified identity. Published listing metadata and listing photos are publicly readable.

## Check MongoDB and copy existing records

Run `npm.cmd run db:check` at the project root to confirm the Atlas connection. The connection string must name the `rentmall` database. Percent-encode reserved characters in the database user's password. Keep the string and Firebase Admin credentials in backend settings.

Before switching a published site, pause changes in Firestore during the cutover. Use Firebase Admin credentials with read access to Firestore and run these from the project root:

```powershell
npm.cmd run db:migrate --workspace @rentmall/api
npm.cmd run db:migrate --workspace @rentmall/api -- --apply
```

The first command counts the source records. The second copies profiles and published ads with their photos, posting dates, IDs, and availability. It preserves existing MongoDB records and reports conflicts instead of overwriting them. The source records remain in Firestore. Saved listings from a browser import when that user signs in on the same browser. Old browser-only drafts and demo requests stay on that device.

## Photo credits

The category tiles and Sahiwal-area banner use licensed Wikimedia Commons photos. The running site links to its [photo credits](/photo-credits.html), which records the source and license for every image.
