from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.adapters.database import SessionLocal
from app.bootstrap import run_bootstrap
from app.core.problems import install_problem_handlers, install_problem_openapi
from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.sync import router as sync_router
from app.routers.vaults import router as vaults_router
from app.spa import install_spa


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_bootstrap(app.state.session_factory)
    yield


app = FastAPI(title="Synapse", lifespan=lifespan)
app.state.session_factory = SessionLocal
# Todo error sale como Problem Details (SPEC-0004), incluido ProvisioningError → 503.
install_problem_handlers(app)
install_problem_openapi(app)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(vaults_router)
app.include_router(sync_router)


@app.get("/health")
def health():
    return {"status": "ok"}


# FastAPI sirve la SPA (SPEC-0007): estáticos del build + fallback de React Router.
# Al final, tras los routers de API, para que las rutas de API ganen al catch-all.
install_spa(app)
