from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.adapters.database import SessionLocal
from app.bootstrap import run_bootstrap
from app.core.problems import install_problem_handlers
from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_bootstrap(app.state.session_factory)
    yield


app = FastAPI(title="Synapse", lifespan=lifespan)
app.state.session_factory = SessionLocal
# Todo error sale como Problem Details (SPEC-0004), incluido ProvisioningError → 503.
install_problem_handlers(app)

app.include_router(auth_router)
app.include_router(admin_router)


@app.get("/health")
def health():
    return {"status": "ok"}
