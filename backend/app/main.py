from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.adapters.database import SessionLocal
from app.bootstrap import run_bootstrap
from app.core.errors import ProvisioningError
from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_bootstrap(app.state.session_factory)
    yield


app = FastAPI(title="Synapse", lifespan=lifespan)
app.state.session_factory = SessionLocal

app.include_router(auth_router)
app.include_router(admin_router)


@app.exception_handler(ProvisioningError)
async def provisioning_error_handler(_: Request, exc: ProvisioningError):
    return JSONResponse(status_code=503, content={"detail": "Storage provisioning unavailable"})


@app.get("/health")
def health():
    return {"status": "ok"}
