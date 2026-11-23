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

## Scripts

```bash
npm run dev      # development server
npm run build    # production build
npm run lint     # lint
```

## Rules

Read [CLAUDE.md](./CLAUDE.md) before contributing: it describes the folder structure,
the page pattern, the API rules and the design guidelines.
