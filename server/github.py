import os, base64, requests
def commit(files, msg):
    t=os.getenv("GITHUB_TOKEN"); o=os.getenv("REPO_OWNER"); r=os.getenv("REPO_NAME")
    h={"Authorization":f"token {t}"}
    for path,content in files.items():
        url=f"https://api.github.com/repos/{o}/{r}/contents/site/{path}"
        g=requests.get(url,headers=h)
        sha=g.json().get("sha") if g.status_code==200 else None
        d={"message":msg,"content":base64.b64encode(content.encode()).decode()}
        if sha: d["sha"]=sha
        requests.put(url,headers=h,json=d).raise_for_status()
