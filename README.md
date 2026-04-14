# PVC Formulation ERP

FastAPI + MongoDB application for managing PVC pipe formulations, material costs, and live profitability calculations.

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip3 install -r requirements.txt
uvicorn backend.main:app --reload --reload-dir backend --reload-dir frontend
```

## Environment

```bash
cp .env.example .env
```

Or create `.env` with:

```bash
MONGODB_USERNAME=your_username
MONGODB_PASSWORD=your_password
MONGODB_HOST=your-cluster.mongodb.net
MONGODB_PARAMS=retryWrites=true&w=majority&appName=your-app
MONGODB_DB=pvc_formulations
```

## Reload Notes

The plain `--reload` command can watch `.venv/` as well as your app code. If packages inside `.venv` change, Uvicorn keeps restarting even though your application code is fine.

Use:

```bash
uvicorn backend.main:app --reload --reload-dir backend --reload-dir frontend
```

If you do not need hot reload:

```bash
uvicorn backend.main:app
```

## Deploy To Vercel

This repo is set up for Vercel with a root `app.py` entrypoint that exports the FastAPI app.

1. Push this repo to GitHub, GitLab, or Bitbucket.
2. Import the repo into Vercel.
3. Set the framework preset to `Other`.
4. Add your environment variables in Vercel Project Settings:

```bash
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=pvc_formulations
```

You can also use the split variables already supported by the app:

```bash
MONGODB_USERNAME=your_username
MONGODB_PASSWORD=your_password
MONGODB_HOST=your-cluster.mongodb.net
MONGODB_PARAMS=retryWrites=true&w=majority&appName=your-app
MONGODB_DB=pvc_formulations
```

After deployment, Vercel will install from `requirements.txt` and serve the FastAPI app from `app.py`.
