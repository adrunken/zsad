from pathlib import Path
import time, shutil
HIST=Path("site/.history")
def snapshot(files):
    ts=str(int(time.time()))
    d=HIST/ts; d.mkdir(parents=True,exist_ok=True)
    for f,p in files.items():
        shutil.copy(p, d/f)
    return ts
def restore(ts):
    d=HIST/ts
    if not d.exists(): raise FileNotFoundError
    for f in d.iterdir():
        shutil.copy(f, Path("site")/f.name)
