from fastapi import FastAPI
from app.routers.auth import router as auth_router

app = FastAPI(title="Synapse")

app.include_router(auth_router)


@app.get("/health")
def health():
    return {"status": "ok"}
