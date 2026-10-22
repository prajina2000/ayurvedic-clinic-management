# Ayurvedic Clinic Management System

Full-stack clinic operations app using React, Vite, Tailwind CSS, Express, Prisma ORM, and PostgreSQL. The first workflow is Reception: patient registration/search, daily token booking, queue updates, and visit history. The API also includes doctor prescriptions, batch pharmacy stock and billing, therapy scheduling and billing, accounts, and role dashboards.

## Requirements

- Node.js 20.19+ (or 22.12+)
- PostgreSQL 15+
- npm

## Setup

1. Install and start PostgreSQL, then create an empty database named `ayurvedic_clinic` (for example, with pgAdmin or `createdb -U postgres ayurvedic_clinic`).
2. Copy `.env.example` to `backend/.env`, then set `DATABASE_URL` to the database connection string, a private `JWT_SECRET` (at least 32 characters), and the clinic name/address/phone before printing prescriptions or invoices.
3. Apply the Prisma migration, seed reference data and the Admin, then start the backend:

   ```sh
   cd backend
   npm install
   npm run init-db
   npm run seed
   npm run dev
   ```

   `npm run init-db` runs `prisma migrate deploy`, then seeds sample departments, ICD codes, medicines, and procedures. `npm run seed` creates the first Admin from `BOOTSTRAP_ADMIN_*` values. Change the sample email/password in `backend/.env` first.

4. In a second terminal, set up the frontend:

   ```sh
   cd frontend
   npm install
   copy .env.example .env.local  # PowerShell / Windows
   npm run dev
   ```

   On macOS/Linux, use `cp .env.example .env.local`. In development, Vite proxies `/api` to the backend on port 4000 to avoid browser CORS issues. For a production build, set `VITE_API_URL` to the deployed API base URL.

5. Open the Vite URL shown in the terminal and sign in with the bootstrap Admin credentials.

## Prisma and PostgreSQL storage

The backend uses Prisma Client for persistence and Prisma Migrate for versioned SQL migrations. The Prisma model is in `backend/prisma/schema.prisma`; its initial SQL migration is in `backend/prisma/migrations/20261022000000_init/migration.sql`.

To preserve the existing API behavior and PostgreSQL records, the current Prisma model maps the `clinic_documents` JSONB table. The collection adapter in `backend/config/db.js` is implemented with Prisma Client, and its transactions use Prisma's serializable transactions. The project can add dedicated relational models incrementally without changing the current stored data. This fresh PostgreSQL setup does not import data from the former database.

For a schema change during development, edit `schema.prisma`, run `npm run migrate:dev -- --name describe_change`, and commit the generated migration. For a new setup or deployment, `npm run init-db` applies checked-in migrations and seeds reference data.

## REST API

All protected endpoints use `Authorization: Bearer <JWT>`.

| Prefix | Purpose |
| --- | --- |
| `POST /api/auth/login`, `GET /api/auth/me` | Session |
| `/api/reception/patients`, `/api/reception/tokens`, `/api/reception/departments` | Reception, search, queues and history |
| `/api/doctor/icd-codes`, `/api/doctor/medicines`, `/api/doctor/visits`, `/api/doctor/prescriptions/:id` | Consultations and prescriptions |
| `/api/pharmacy/stock`, `/api/pharmacy/purchases`, `/api/pharmacy/bills`, `/api/pharmacy/bills/:id/cancel` | Pharmacy billing, inventory, and audited bill cancellation |
| `/api/procedures/catalog`, `/api/procedures/plans`, `/api/procedures/sessions`, `/api/procedures/bills` | Therapies |
| `/api/accounts/daybook`, `/api/accounts/reports`, `/api/accounts/outstanding`, `/api/accounts/expenses` | Accounts |
| `/api/users` | Admin user management |
| `GET /api/dashboard`, `GET /api/clinic` | Role dashboard and clinic settings |
| `/api/webhooks/whatsapp` | Meta WhatsApp Cloud API webhook |

Patient and queue lists support pagination/search query parameters. Token counters are serialized per local clinic date, department, and doctor so simultaneous bookings cannot claim the same number. Pharmacy billing consumes unexpired batches by earliest expiry, records editable per-line prices, discounts, and GST, and uses an idempotency key so retries do not deduct stock twice. Bill cancellation records a reason and audit entry while restoring the affected batches in a database transaction. Procedure GST is configurable per catalog item. Sample GST rates are zero until entered by the clinic.

## WhatsApp Cloud API

The webhook is inactive until credentials are configured. Set `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, and `WHATSAPP_PHONE_NUMBER_ID`, then set `WHATSAPP_DEFAULT_DEPARTMENT_ID` if bookings should go to a specific department. Configure the public callback URL as `/api/webhooks/whatsapp`; callers can send `REGISTER` or `BOOK`. The bot asks for name, age, gender, and place, then either returns the UHID or books and replies with a token number.

## Roles

Admin can access every module and create users. Receptionist manages patients and queues. Doctor views patient history and records consultations. Pharmacist manages medicine stock, purchases, and billing. Therapist manages procedure schedules. Accountant views day books, dues, reports, expenses, and procedure billing.

## Notes

- `backend/.env` and `frontend/.env.local` are local secrets/configuration and should not be committed.
- Clinic identity, timezone, currency, WhatsApp settings, and PostgreSQL connection details are environment configurable.
- Medicine invoices can be downloaded as PDF or printed. CSV report exports open in Excel; the browser print dialog can also save prescriptions and reports as PDF.
