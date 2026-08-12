from fastapi import FastAPI

app = FastAPI(title="Synapse")


@app.get("/health")
def health():
    return {"status": "ok"}
