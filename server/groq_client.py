import os, requests, json
GROQ_API_KEY=os.getenv("GROQ_API_KEY")
MODEL=os.getenv("GROQ_MODEL","llama-3.1-70b")
URL="https://api.groq.com/openai/v1/chat/completions"
SYSTEM="""You are an expert web engineer modifying an existing website.
Preserve unrelated functionality.
Return JSON with keys: files (object mapping filename to full new content).
Do not explain. No markdown."""
def generate(prompt, files):
    payload={
        "model":MODEL,
        "messages":[
            {"role":"system","content":SYSTEM},
            {"role":"user","content":"CURRENT FILES:\n"+json.dumps(files)},
            {"role":"user","content":"REQUEST:\n"+prompt}
        ],
        "temperature":0.2
    }
    r=requests.post(URL,headers={
        "Authorization":f"Bearer {GROQ_API_KEY}",
        "Content-Type":"application/json"
    },json=payload,timeout=60)
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])
