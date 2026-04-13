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
