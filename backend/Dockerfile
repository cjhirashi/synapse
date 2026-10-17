# FastAPI sirve la API y la SPA (SPEC-0007). El contexto de build es la RAÍZ del repo
# (ver docker-compose.yml) para que esta etapa pueda leer `frontend/` y `backend/`.

# Etapa 1 — compila la SPA (tsc + vite build) con las dependencias fijadas en el lockfile.
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Etapa 2 — backend FastAPI; sirve `/auth`, `/admin`, `/sync`, `/vaults` y además la SPA.
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
# El build del frontend se monta con StaticFiles (app/spa.py) desde FRONTEND_DIST.
COPY --from=frontend /frontend/dist /app/static
ENV FRONTEND_DIST=/app/static
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
