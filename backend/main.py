import json, os
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

from facts import build_facts
from metrics import enrich

load_dotenv()

app = FastAPI(title="Exoplanet Explorer")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DATA_FILE = "exoplanets.json"
NASA_URL = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
NASA_QUERY = """
select pl_name, hostname, discoverymethod, disc_year, sy_dist,
       pl_rade, pl_bmasse, pl_orbper, pl_orbsmax, pl_eqt, pl_insol,
       st_teff, st_rad, st_mass, sy_pnum, ra, dec
from pscomppars
where pl_rade is not null and sy_dist is not null
"""

PLANETS: list = []
BY_NAME: dict = {}
INSIGHT_CACHE: dict = {}


def load_planets(raw):
    global PLANETS, BY_NAME
    PLANETS = [enrich(p) for p in raw]
    BY_NAME = {p["pl_name"].lower(): p for p in PLANETS}
    INSIGHT_CACHE.clear()


with open(DATA_FILE) as f:
    load_planets(json.load(f))

# Any OpenAI-compatible provider works. Defaults to local Ollama.
client = OpenAI(
    base_url=os.getenv("LLM_BASE_URL", "http://localhost:11434/v1"),
    api_key=os.getenv("LLM_API_KEY", "ollama"),
)
MODEL = os.getenv("LLM_MODEL", "llama3.2")

# ---------- the astronomer ----------

BASE_RULES = """You are Astro, a friendly virtual astronomer inside a 3D exoplanet explorer. Your audience is curious non-experts.

STRICT RULES
1. Use ONLY the FACTS provided below. Never add numbers, names or details that are not in them.
2. If something is not in the facts, say "NASA's data doesn't tell us that."
3. Never say life is likely, promising or possible. Never speculate about atmosphere, oceans, surface, weather or aliens. The honest conclusion is that the data cannot show whether life exists.
4. Equilibrium temperature is not surface temperature. ESI measures similarity to Earth in size, density and temperature; it is not a chance of life.
5. Describe stars exactly as the facts do. Never call a cool red dwarf hot.
6. Plain text only: no markdown, no asterisks, no bullet points, no headings.
7. Be concise: at most 80 words unless the user asks for more."""

MODE_PROMPTS = {
    "life": (
        "Task: answer 'Could life exist here?'. Write exactly three sentences. "
        "Sentence 1: what the facts say about size, starlight and temperature compared with Earth. "
        "Sentence 2: what the data does not tell us (for example atmosphere or water). "
        "Sentence 3, word for word: So the data cannot tell us whether life exists here."
    ),
    "earth": (
        "Task: compare with Earth in three short sentences covering size, starlight received and temperature. "
        "Use the numbers from the facts."
    ),
    "special": (
        "Task: in three sentences, say what is most distinctive or interesting about this world or system, "
        "using only the facts."
    ),
    "insight": (
        "Task: write 3 short sentences: what kind of world this is, what stands out, "
        "and how Earth-like it is (explain the ESI and habitable-zone result)."
    ),
    "free": (
        "Task: answer the user's question using only the facts. "
        "If the question cannot be answered from the facts, say so plainly."
    ),
}


def get_or_404(name: str):
    p = BY_NAME.get(name.lower())
    if not p:
        raise HTTPException(404, f"Planet not found: {name}")
    return p


def facts_block(records):
    parts = []
    for p in records:
        f = build_facts(p)
        parts.append(f"## {p['pl_name']}\n" + "\n".join("- " + line for line in f["lines"]))
    return "\n\n".join(parts)


def build_messages(message, names, history, mode):
    records = [BY_NAME[n.lower()] for n in names if n.lower() in BY_NAME][:8]
    facts = facts_block(records) or "No planet selected."
    system = f"{BASE_RULES}\n\n{MODE_PROMPTS.get(mode, MODE_PROMPTS['free'])}\n\nFACTS\n{facts}"
    msgs = [{"role": "system", "content": system}]
    for h in history[-4:]:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            msgs.append({"role": h["role"], "content": h["content"]})
    msgs.append({"role": "user", "content": message})
    return msgs


def ask_llm(messages):
    try:
        resp = client.chat.completions.create(
            model=MODEL, messages=messages, temperature=0.3, max_tokens=260
        )
    except Exception as e:
        raise HTTPException(502, f"LLM error: {e}")
    return resp.choices[0].message.content


def stream_llm(messages):
    try:
        stream = client.chat.completions.create(
            model=MODEL, messages=messages, temperature=0.3, max_tokens=260, stream=True
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        yield f"\n[AI model error: {e}]"


# ---------- data endpoints ----------

CARD_KEYS = [
    "pl_name", "hostname", "sy_dist", "pl_rade", "pl_bmasse", "pl_orbper", "pl_orbsmax",
    "pl_eqt", "flux", "st_teff", "st_rad", "sy_pnum", "ra", "dec", "type", "esi",
    "esi_factors", "hz_status", "discoverymethod", "disc_year",
]


def card(p):
    return {k: p.get(k) for k in CARD_KEYS}


@app.get("/planets")
def list_planets(
    q: Optional[str] = None,
    type: Optional[str] = None,
    habitable: bool = False,
    min_esi: Optional[float] = None,
    max_dist: Optional[float] = None,
    sort: str = "name",
    limit: int = 0,
):
    res = PLANETS
    if q:
        ql = q.lower()
        res = [p for p in res if ql in p["pl_name"].lower() or ql in (p.get("hostname") or "").lower()]
    if type:
        res = [p for p in res if p["type"].lower() == type.lower()]
    if habitable:
        res = [p for p in res if p["hz_status"] == "In habitable zone"]
    if min_esi is not None:
        res = [p for p in res if p["esi"] is not None and p["esi"] >= min_esi]
    if max_dist is not None:
        res = [p for p in res if p["sy_dist"] is not None and p["sy_dist"] <= max_dist]
    if sort == "esi":
        res = sorted(res, key=lambda p: p["esi"] if p["esi"] is not None else -1, reverse=True)
    elif sort == "distance":
        res = sorted(res, key=lambda p: p["sy_dist"])
    else:
        res = sorted(res, key=lambda p: p["pl_name"])
    if limit:
        res = res[:limit]
    return [card(p) for p in res]


@app.get("/planets/{name}")
def get_planet(name: str):
    return get_or_404(name)


@app.get("/facts/{name}")
def get_facts(name: str):
    return build_facts(get_or_404(name))


@app.get("/compare")
def compare(a: str, b: str):
    pa, pb = get_or_404(a), get_or_404(b)
    fields = ["pl_rade", "pl_bmasse", "pl_orbper", "pl_orbsmax", "pl_eqt", "flux", "sy_dist", "esi"]
    rows = [{"field": f, "a": pa.get(f), "b": pb.get(f)} for f in fields]
    more_earthlike = None
    if pa["esi"] is not None and pb["esi"] is not None:
        more_earthlike = pa["pl_name"] if pa["esi"] >= pb["esi"] else pb["pl_name"]
    return {"a": pa, "b": pb, "rows": rows, "more_earthlike": more_earthlike}


@app.get("/featured")
def featured(n: int = 10):
    full = [p for p in PLANETS if p["esi"] is not None and p["esi_factors"] == 4]
    top = sorted(full, key=lambda p: p["esi"], reverse=True)[:n]
    return [card(p) for p in top]


@app.get("/stats")
def stats():
    by_type = {}
    for p in PLANETS:
        by_type[p["type"]] = by_type.get(p["type"], 0) + 1
    return {
        "total": len(PLANETS),
        "habitable_zone": sum(1 for p in PLANETS if p["hz_status"] == "In habitable zone"),
        "by_type": by_type,
        "nearest": card(min(PLANETS, key=lambda p: p["sy_dist"])),
    }


@app.post("/refresh")
def refresh():
    """Re-download the latest data from NASA and reload it."""
    try:
        r = requests.get(NASA_URL, params={"query": NASA_QUERY, "format": "json"}, timeout=60)
        r.raise_for_status()
        raw = r.json()
    except Exception as e:
        raise HTTPException(502, f"NASA fetch failed: {e}")
    with open(DATA_FILE, "w") as f:
        json.dump(raw, f)
    load_planets(raw)
    return {"planets": len(PLANETS)}


# ---------- AI endpoints ----------

@app.get("/insight/{name}")
def insight(name: str):
    p = get_or_404(name)
    key = p["pl_name"]
    if key not in INSIGHT_CACHE:
        msgs = build_messages("Give me the summary.", [key], [], "insight")
        INSIGHT_CACHE[key] = ask_llm(msgs)
    return {"planet": key, "insight": INSIGHT_CACHE[key]}


class ChatRequest(BaseModel):
    message: str
    planets: list[str] = []      # 1 name = explain, 2+ = compare / whole system
    history: list[dict] = []
    mode: str = "free"           # life | earth | special | free


@app.post("/chat")
def chat(req: ChatRequest):
    return {"reply": ask_llm(build_messages(req.message, req.planets, req.history, req.mode))}


@app.post("/chat/stream")
def chat_stream(req: ChatRequest):
    msgs = build_messages(req.message, req.planets, req.history, req.mode)
    return StreamingResponse(
        stream_llm(msgs),
        media_type="text/plain",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )