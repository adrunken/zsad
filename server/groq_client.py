import os, requests, json, logging
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("ai-site-editor")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MODEL = os.getenv("GROQ_MODEL", "llama-3.1-70b")
URL = "https://api.groq.com/openai/v1/chat/completions"

SYSTEM = """You are an expert web engineer modifying an existing website.
Preserve unrelated functionality and existing code.
Return JSON with keys: files (object mapping filename to full new content).
Do not explain. No markdown. Only JSON."""

def generate(prompt, files):
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY environment variable not set")

    log.info("Sending prompt to Groq")
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": "CURRENT FILES:\n" + json.dumps(files)},
            {"role": "user", "content": "REQUEST:\n" + prompt}
        ],
        "temperature": 0.2
    }

    r = requests.post(
        URL,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        },
        json=payload,
        timeout=60
    )
    log.info(f"Groq status: {r.status_code}")
    r.raise_for_status()

    try:
        response_data = r.json()
        content = response_data["choices"][0]["message"]["content"]
        return json.loads(content)
    except (json.JSONDecodeError, KeyError) as e:
        log.error(f"Failed to parse Groq response: {e}")
        raise ValueError(f"Invalid response from Groq: {e}")
