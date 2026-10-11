from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.adapters.database import SessionLocal
from app.bootstrap import run_bootstrap
from app.routers.auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_bootstrap(app.state.session_factory)
    yield


app = FastAPI(title="Synapse", lifespan=lifespan)
app.state.session_factory = SessionLocal

app.include_router(auth_router)


@app.get("/health")
def health():
    return {"status": "ok"}
