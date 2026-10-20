# Food Rescue

## Requirements

- Node.js and npm
- Python 3.10 or later (the backend uses only Python's standard library)

## Run locally

Start the backend in one terminal:

```powershell
cd backend
python main.py
```

Start the frontend in another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). The frontend
checks `http://localhost:8000/health`; a working backend responds with
`{"status":"Connected"}`.

## Verify the frontend

```powershell
cd frontend
npm run lint
npm run build
```
