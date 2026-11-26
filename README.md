# Dr. Bahr ERP — Frontend

The web frontend of **Dr. Bahr ERP**, an ERP system for an Egyptian import & distribution company.
The UI is Arabic only (RTL). It talks to a separate NestJS backend API.

**Stack:** React 19, Vite, JavaScript (JSX), Tailwind CSS v4, React Router, Axios, lucide-react.

## Requirements

- [Node.js](https://nodejs.org/) 20 or newer (with npm)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — to run the backend locally

## Folder layout

The backend and frontend repos live side by side in one parent folder:

```text
dr-bahr/
├── backend/     ← NestJS API (separate repo), API docs in backend/doc/
└── frontend/    ← this repo
```

## Setup

1. **Start the backend (required).**
   Every page that talks to the API needs the backend running in Docker.
   Open **Docker Desktop**, then run inside `../backend`:

   ```bash
   cd ../backend
   docker compose up -d
   ```

   The API is then available on `http://localhost:3000`.
   Without it, the app still opens but shows the message
   _"تعذر الاتصال بالخادم، تحقق من الاتصال وحاول مرة أخرى"_ (cannot connect to the server)
   on login and on every page that loads data.

2. **Create your local env file** (back in `frontend/`):

   ```bash
   cp .env.example .env.local
   ```

   It contains `VITE_API_URL=http://localhost:3000`. Restart the dev server after changing it.

3. **Install and run:**

   ```bash
   npm install
   npm run dev
   ```

   Open `http://localhost:5173`.

### Default local login

| Username | Password   | Role       |
| -------- | ---------- | ---------- |
| `admin`  | `admin123` | SUPERADMIN |

### بيانات تجربة (demo data)

To try the whole system without typing data, fill the local database with a realistic demo company
(3 branches, 5 warehouses, ~25 products with opening stock and units, customers, suppliers, employees, USD / EUR,
4 users and 6 purchase quotations). Run it **after the backend is up**:

```bash
npm run seed:demo
```

It works only through the API (logs in as `admin`), and it is safe to run again: it creates only what is
missing and never edits or deletes anything (EGP stays the default currency, `admin` is not touched).

| Username          | Password   | Role       |
| ----------------- | ---------- | ---------- |
| `mohamed.ali`     | `Demo@123` | ADMIN      |
| `sara.hassan`     | `Demo@123` | ACCOUNTANT |
| `mahmoud.ibrahim` | `Demo@123` | SALES      |
| `youssef.adel`    | `Demo@123` | USER       |

(They can log in, but until Week 5 only SUPERADMIN may open pages and call the API — the others see "ليس لديك صلاحية".)

**Demo purchase quotations (عروض أسعار الشراء)** — one of each status, found again by their notes
("عرض تجريبي 1 — …" … "عرض تجريبي 6 — …"), dated relative to the day the seed runs:

| # | Status | What to try |
| - | ------ | ----------- |
| 1 | مسودة (today) | edit it, إرسال, حذف |
| 2 | مُرسل, valid 30 more days (cartons, a line discount, 10% + tax 14%) | قبول / رفض |
| 3 | مُرسل, **منتهي** (dated 20 days ago, valid until 5 days ago; a fixed discount) | the "منتهي" badge |
| 4 | مقبول, with a warehouse | تحويل لفاتورة |
| 5 | مرفوض (with a SERVICE line) | only حذف |
| 6 | تم التحويل لفاتورة (dated 10 days ago) | its DRAFT purchase invoice (CREDIT, dated 8 days ago) |

The seed prints the codes (PQ-… → PI-…). A quotation left half way by an interrupted run is moved on to its status.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run lint       # lint
npm run test:e2e   # browser tests (Playwright) — the backend must be running
npm run seed:demo  # demo data (بيانات تجربة) through the API
```

## Rules

Read [CLAUDE.md](./CLAUDE.md) before contributing: it describes the folder structure,
the page pattern, the API rules and the design guidelines.
