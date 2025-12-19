from fastapi import FastAPI, HTTPException, Request, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
from server.groq_client import generate
from server.history import snapshot, restore
from server.github import commit
import logging, time


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ai-site-editor")

class GenerateRequest(BaseModel):
    prompt: str

class RollbackRequest(BaseModel):
    version: str

app=FastAPI()

SITE=Path("site")
FILES={ "live.html": SITE/"live.html", "main.js": SITE/"main.js", "styles.css": SITE/"styles.css" }
(SITE / ".history").mkdir(parents=True,exist_ok=True)

LAST_CALL=0
MIN_SECONDS=5

@app.middleware("http")
async def log_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        log.exception("Unhandled server error")
        raise

@app.get("/health")
def health():
    return {"status":"ok"}

@app.get("/")
async def root():
    return FileResponse("client/index.html")

@app.get("/app.js")
async def app_js():
    return FileResponse("client/app.js", media_type="application/javascript")

@app.post("/generate")
def gen(request: GenerateRequest):
    global LAST_CALL
    now = time.time()
    if now - LAST_CALL < MIN_SECONDS:
        raise HTTPException(429, "Rate limit: wait a few seconds")
    LAST_CALL=now

    prompt=request.prompt
    if not prompt: raise HTTPException(400,"Missing prompt")
    current={k:v.read_text() for k,v in FILES.items()}
    result=generate(prompt,current).get("files")
    if not isinstance(result, dict):
        raise HTTPException(400,"Invalid AI response")
    for k in result:
        if k in FILES:
            (SITE/f"preview_{k}").write_text(result[k])
    return {"ok":True}

@app.post("/publish")
def pub():
    ts=snapshot(FILES)
    new={}
    for k in FILES:
        pv=SITE/f"preview_{k}"
        if pv.exists():
            content=pv.read_text()
            FILES[k].write_text(content)
            new[k]=content
    commit(new,f"AI publish {ts}")
    return {"ok":True,"version":ts}

@app.get("/history")
def hist():
    return [p.name for p in (SITE/'.history').iterdir() if p.is_dir()]

@app.post("/rollback")
def rb(request: RollbackRequest):
    v = request.version
    if not v: raise HTTPException(400,"Missing version")
    restore(v)
    return {"ok":True}

app.mount("/site", StaticFiles(directory="site"), name="site")
app.mount("/client", StaticFiles(directory="client"), name="client")
