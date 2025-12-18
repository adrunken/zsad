from fastapi import FastAPI, HTTPException
from pathlib import Path
from groq_client import generate
from history import snapshot, restore
from github import commit
app=FastAPI()
SITE=Path("site")
FILES={
 "live.html": SITE/"live.html",
 "main.js": SITE/"main.js",
 "styles.css": SITE/"styles.css"
}
@app.post("/generate")
def gen(p:dict):
    prompt=p.get("prompt")
    if not prompt: raise HTTPException(400)
    current={k:v.read_text() for k,v in FILES.items()}
    result=generate(prompt,current)["files"]
    for k in result:
        if k in FILES:
            (SITE/"preview_"+k).write_text(result[k])
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
def rb(p:dict):
    restore(p.get("version"))
    return {"ok":True}
