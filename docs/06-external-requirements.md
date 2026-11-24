# 06 — External Requirements

Everything the team needs from **outside the repo**: software, models, hardware, devices, accounts and licences. Each item has an owner who confirms it on Day 0.

## 1. Software (every member)

| Item | Version | Needed by | Install | Notes |
|---|---|---|---|---|
| Git | ≥ 2.40 | all | git-scm.com | Set `core.autocrlf=false` (repo uses `.gitattributes`) |
| Node.js | 20 LTS | all | nodejs.org / `fnm` | |
| npm | 10 (ships with Node 20) | all | — | Team standard (see T0.1) |
| Python | 3.11.x | all | python.org | 3.12 may break pix2tex/torch wheels; 3.11 is the safe choice |
| VS Code | latest | all | code.visualstudio.com | Extensions: ESLint, Prettier, Python, Pylance, Ruff, Tailwind CSS IntelliSense, Markdown Preview Mermaid Support, Playwright Test |
| GitHub CLI `gh` | latest | M1 (others optional) | cli.github.com | PRs, issues |
| Playwright browsers | match `@playwright/test` | M1, M2 | `npx playwright install --with-deps` | ~500 MB |
| Docker Desktop | latest | M1 (others optional) | docker.com | Only for T8.1 |
| OBS Studio | latest | M1, M4 | obsproject.com | Demo + evidence recording |

## 2. AI / ML components (local, no paid APIs)

| Item | Size (approx.) | Owner | Install / fetch | Licence check |
|---|---|---|---|---|
| SymPy | small | M3 | `pip install sympy` | BSD ✅ |
| antlr4-python3-runtime 4.11.x | small | M3 | pip | BSD ✅. **Version must match SymPy's LaTeX parser** |
| PyTorch (CPU) | ~200 MB–1 GB | M3 | `pip install torch --index-url https://download.pytorch.org/whl/cpu` | BSD ✅ |
| pix2tex + weights | package + ~100 MB+ weights (first-run download) | M3 | `pip install pix2tex` | MIT for code. **Check the weights' terms** before redistributing |
| OpenCV (headless) | ~50 MB | M3 | `pip install opencv-python-headless` | Apache-2.0 ✅ |
| Ollama runtime | ~200 MB | M3 (all for demo) | ollama.com | MIT ✅ |
| Candidate LLMs | 2–5 GB each | M3 | `ollama pull qwen2.5:3b`, `qwen2.5:7b`, `llama3.2:3b`, `phi3.5` | **Check each model licence** (Qwen, Llama community licence, MIT). Record the result in `ai/benchmarks/DECISION.md` |
| MathLive | npm | M2 | `npm i mathlive` | MIT ✅ |
| KaTeX | npm | M2 | `npm i katex` | MIT ✅ |
| Recharts | npm | M4/M2 | `npm i recharts` | MIT ✅ |
| Dexie | npm | M2 | `npm i dexie` | Apache-2.0 ✅ |

> **One-time internet needed** to download packages, model weights and Ollama models. After that, everything runs offline. Download the big models on Day 0 over a good connection, and keep a copy on a USB drive for the demo machine.

## 3. Hardware

| Item | Minimum | Recommended | Owner |
|---|---|---|---|
| Dev laptop RAM | 8 GB (no LLM, or 1–3B model only) | 16 GB (7B model + pix2tex) | each |
| Disk free | 10 GB | 20 GB | each |
| GPU | not required | NVIDIA 6 GB+ (CUDA) speeds up the LLM | M3 if available |
| **Demo machine** | the strongest laptop in the team | 16 GB+ RAM, SSD | M1 picks on Day 0 |

## 4. Test devices (for T7.4 and the demo)

| Device class | Needed | Example | Owner | Status |
|---|---|---|---|---|
| Tablet with stylus | **1 (required)** | iPad + Apple Pencil, Samsung Tab + S Pen, Surface | M2 | ☐ |
| Phone (Android) | 1 | any Chrome Android | M4 | ☐ |
| Phone (iOS) | 1 (nice to have) | Safari iOS | anyone | ☐ |
| Non-touch laptop | **1 (required)** | any Windows/Mac laptop | M1 | ☐ |
| Touch laptop / 2-in-1 | 1 (nice to have) | Surface / Yoga | anyone | ☐ |

**LAN access:** devices must reach the dev machine (`vite --host 0.0.0.0`, backend `--host 0.0.0.0`, firewall rule for ports 5173/8000). Camera access on phones needs a **secure context**. Either use `https` via `vite --https` with `@vitejs/plugin-basic-ssl`, or open `localhost` with port forwarding (`chrome://inspect` → port forwarding for Android).

## 5. Accounts & services

| Account | Purpose | Cost | Owner |
|---|---|---|---|
| GitHub (all 4) | repo, PRs, Actions | free | each |
| Devpost / hackathon portal | submission | free | M1 |
| Team chat (Discord/Slack/WhatsApp) | async communication | free | M1 |
| YouTube/Drive (unlisted) | demo video hosting | free | M1 |

**Not needed (by policy):** OpenAI, Gemini, Anthropic or any paid AI API key; commercial OCR; paid hosting.

## 6. Content & data

| Item | Owner | Due |
|---|---|---|
| 7 MVP concepts + prerequisites | M4 | Day 1 |
| 35 practice problems | M4 | Day 2 |
| 100–150 labelled solutions | M4 (M3 reviews) | ≥ 40 by Day 3, ≥ 100 by Day 5 |
| 30+ handwriting photos (varied writers) | M4 collects from all | Day 4 |
| Human ratings of 30 explanations × 2 raters | M4 + M1 | Day 6 |

## 7. Licences

Before the release tag, M3 fills in this table and M1 signs it off:

| Component | Licence | Redistribution OK? | Attribution required? | Notes |
|---|---|---|---|---|
| pix2tex code | MIT | | | |
| pix2tex weights | | | | |
| Selected LLM | | | | |
| Fallback LLM | | | | |
| MathLive / KaTeX / Recharts / Dexie | MIT / MIT / MIT / Apache-2.0 | yes | yes (keep notices) | |
| Dataset (self-authored) | team's choice (CC-BY-4.0 suggested) | yes | | |

> Open source or open weights do **not** automatically mean unrestricted redistribution. Don't bundle weights in the repo; document how to download them instead.
