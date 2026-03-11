# VibeCoder

**The AI-powered full-stack IDE that builds, deploys, and runs your apps — all from one interface.**

VibeCoder is a self-hosted vibe-coding platform where you describe what you want and the AI builds it. Unlike other tools, VibeCoder gives you a **real production environment** — your code runs in Docker containers on your own server, with a real database, real deployments, and a real URL.

> "Describe your app. Watch it build. Ship it live — in minutes."

---

## Deploy VibeCoder in 2 Minutes

[![Deploy on VibeCo.de](https://img.shields.io/badge/%F0%9F%9A%80_Deploy_on-vibecode.new-7C3AED?style=for-the-badge&labelColor=1e1b4b&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNhNzhmZmYiIHN0cm9rZS13aWR0aD0iMiI+PHBhdGggZD0iTTEyIDV2MTRNNSAxMmwxNCA3Ii8+PC9zdmc+)](https://vibecode.new)

**No server setup needed.** Sign up at [vibecode.new](https://vibecode.new), and we provision a fully configured VPS for you automatically — VibeCoder IDE, PostgreSQL, Redis, Traefik, Docker, everything. Your apps are live in minutes with a real URL.

### What You Need (API Keys)

VibeCoder uses external AI and search APIs. You bring your own keys:

| Service | What It Does | Get a Key |
|---------|-------------|-----------|
| **[OpenRouter](https://openrouter.ai)** | All AI work — code generation, classification, planning, code research, auto-fix. Access **300+ models** from one API key. Cheap models (Gemini Flash, DeepSeek V3) handle most work; premium models (Claude Opus 4.6, Gemini Pro 3.1, GPT-5.4) used as maestro only when needed. **OpenRouter gives free credits every month to get started.** | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **[Serper.dev](https://serper.dev)** | Web research — searches for best practices, framework docs, and architecture patterns before the AI plans your app. | [serper.dev/api-key](https://serper.dev/api-key) |

> **Cost estimate:** A typical app generation costs **$0.01-0.10** in API calls. OpenRouter gives free credits every month to get started. Serper.dev gives 2,500 free searches.

### AI Models (Fully Configurable)

VibeCoder uses **300+ models** via OpenRouter. You can swap any model from the settings. Default configuration:

| Role | Default Model | Cost | When Used |
|------|--------------|------|-----------|
| **Cheap** (classifier, code research, direct edits) | Gemini 2.0 Flash | ~$0.10/1M tokens | Most work — classification, analysis, simple edits |
| **Mid** (planning, generation, auto-fix) | DeepSeek V3 | ~$0.27/1M tokens | Maestro tier — plans, generates, fixes |
| **Maestro** (premium fallback) | Claude Opus 4.6 / Gemini Pro 3.1 / GPT-5.4 | $3-15/1M tokens | Only when cheap models fail or for critical tasks |

> **You choose your maestro model** — Claude Opus 4.6, Gemini Pro 3.1, GPT-5.4, or any premium model on OpenRouter. Cheap models handle 95%+ of all API calls, keeping costs near zero.

---

## Why VibeCoder?

Most AI coding tools generate code in a sandbox and leave you to figure out deployment, databases, and infrastructure. VibeCoder handles the entire lifecycle:

1. **You describe your app** in plain language
2. **AI analyzes your codebase**, researches best practices, plans the architecture, and generates production-ready code
3. **Code is committed to GitHub** automatically
4. **Your app is built and deployed** to a Docker container on your own server
5. **You get a live URL** — a real running app, not a preview

---

## VibeCoder vs Lovable vs Bolt.new

| Feature | VibeCoder | Lovable | Bolt.new |
|---------|-----------|---------|----------|
| **AI Pipeline** | Multi-stage: Classify + Code Research + Web Research + Plan + Generate | Single-pass generation | Single-pass generation |
| **Code Research** | Analyzes ALL existing files before generating — follows your patterns | No codebase analysis | No codebase analysis |
| **Web Research** | Searches the web for best practices before planning | No web research | No web research |
| **Architecture Planning** | AI creates detailed plan (schema, routes, components) before coding | No planning phase | No planning phase |
| **Auto-Fix Loop (Ralph)** | Detects build errors and auto-fixes them in a loop | Manual error fixing | Manual error fixing |
| **Real Database** | Per-project PostgreSQL with Prisma ORM — real data, real queries | No real database | No real database |
| **Real Deployment** | Docker containers on your own server with live URLs | Hosted sandbox | WebContainer (browser) |
| **Custom Domains** | Wildcard SSL via Cloudflare — `yourapp.yourdomain.co` | Lovable subdomain only | No custom domains |
| **Environment Variables** | Full env var management per project | Limited | Limited |
| **Terminal Access** | Real terminal into your running container | No terminal | WebContainer terminal |
| **Build Tools** | Run Prisma migrations, npm commands, DB operations from UI | No build tools | npm in browser |
| **Git Integration** | Every AI change = GitHub commit, full history | Git export only | No git |
| **Container Management** | Automated Docker orchestration | No containers | No containers |
| **Self-Hosted** | Runs on your own infrastructure — you own everything | SaaS only | SaaS only |
| **Multi-Model AI** | OpenRouter (300+ models), smart routing, model fallback | Fixed model | Fixed model |
| **Cost Control** | Use cheap models (Gemini Flash, DeepSeek) — escalate only when needed | Fixed pricing | Fixed pricing |
| **Framework** | Next.js 16 + React 19 + Tailwind v4 + Prisma 7 (latest) | React + Vite | React + Vite |
| **Backend Support** | Full-stack: API routes, database, auth, Redis | Frontend only | Frontend focused |
| **Live Preview** | Sandpack sandbox + live deployed site | Browser preview | WebContainer preview |
| **Project Download** | Download full source code as ZIP anytime | Export available | No download |

### What Makes VibeCoder Unique

**1. Code Research Phase** — Before generating any code, VibeCoder sends ALL your project files to a cheap AI model for deep semantic analysis. The AI understands your component hierarchy, import patterns, styling conventions, database schema, and API routes. This means modifications follow your existing patterns instead of breaking them.

**2. Multi-Stage Maestro Pipeline** — Not just "prompt → code". VibeCoder's pipeline is:
```
Classify → Select Files → [Code Research + Web Research (parallel)] → Plan → Generate → Commit → Build → Auto-Fix
```
Each stage uses the cheapest capable model. Code research and web research run in parallel for zero added latency.

**3. Real Infrastructure** — Your app runs in a real Docker container with a real PostgreSQL database, real Redis cache, and a real URL. Not a browser sandbox. Not a preview. A production deployment.

**4. Ralph Auto-Fix Loop** — When the build fails, VibeCoder reads the error logs and automatically generates fixes. It loops until the build passes or hits a retry limit. No manual debugging of AI-generated code.

**5. Self-Hosted & Cost-Efficient** — You control the infrastructure. AI calls go through OpenRouter at wholesale prices. A typical app generation costs $0.05-0.50 in API calls, not $20/month subscriptions.

---

## AI Pipeline Architecture

Every message flows through an intelligent multi-stage pipeline:

```
User Message
    |
    v
[1. Intent Classifier] -----> Cheap model (e.g. Gemini Flash — instant)
    |                          Detects: complexity, tier (direct vs maestro)
    v
[2. File Context] -----------> Selects 3-10 most relevant files from GitHub
    |                          Always includes: package.json, tsconfig, next.config
    v
[3. Code Research] ----------> Cheap model analyzes ALL source files (~$0.01)
    |  (runs in parallel)      Outputs: component map, API routes, DB schema,
    |                          styling patterns, import conventions, hierarchy
    v
[4. Web Research] -----------> Serper.dev searches best practices (parallel with #3)
    |                          3 targeted queries, top 10 snippets
    v
[5. Architecture Plan] ------> Mid model (e.g. DeepSeek V3) creates implementation plan
    |                          Schema, routes, components, file structure
    v
[6. Code Generation] --------> Mid model (fallback: maestro model)
    |                          Full file outputs, multi-file architecture
    v
[7. GitHub Commit] ----------> Commits all changed files atomically
    v
[8. Build & Deploy] ---------> Docker build + container restart
    v
[9. Ralph Auto-Fix] ---------> If build fails: read errors → fix → rebuild (loop)
```

**Direct tier** (simple changes): Steps 1 → 2 → 6 → 7 → 8
**Maestro tier** (complex features): All 9 steps

---

## IDE Features

### Chat Panel
- Natural language input to describe what you want
- Real-time pipeline progress: classifying, researching, planning, generating, committing
- Quick actions: Polish, Fix, Test, Deploy
- Full conversation history with file change details

### Live Preview
- **Sandbox mode**: Instant Sandpack preview with hash-based routing for multi-page apps
- **Live mode**: Your actual deployed site in an iframe
- Next.js shims for `next/link`, `next/image`, `next/navigation`, `next/font`
- Tailwind CSS CDN for instant styling
- Desktop / Tablet / Mobile viewport switching

### Code Editor
- Full file tree with syntax-highlighted source code
- Browse all project files from GitHub
- See exactly what the AI generated

### Terminal
- Real shell access into your running Docker container
- Run any command: npm, prisma, node, etc.

### Environment Variables
- Per-project env var management
- Injected into container on deploy
- Supports DATABASE_URL, REDIS_URL, API keys, etc.

### Build Tools
- Run Prisma migrations (`prisma db push`, `prisma generate`)
- Execute npm commands (`npm install`, `npm run build`)
- Database operations from the UI

### Database Management
- Per-project PostgreSQL database provisioning
- Auto-sets DATABASE_URL in environment
- SQL query panel for direct database access

### Git Panel
- Full commit history from GitHub
- Every AI change is a tracked commit
- Branch and diff information

### Deploy
- One-click redeploy with latest code
- Container stop → pull → recreate → start
- Environment variables injected on deploy

### Logs
- Real-time container logs
- Build output and error tracking
- Ralph auto-fix loop visibility

### Domains
- Automatic subdomain: `yourapp.yourdomain.co`
- Wildcard SSL via Cloudflare
- Traefik reverse proxy routing

---

## Platform Features

Beyond the IDE, VibeCoder includes a full platform:

### Smart Chat Engine
- **6 chat modes**: Classic (routed), Multimodel (5 models compete), Skilled (custom prompts), MCP (tool use), Research (web research), OpenBook (learn from documents)
- **Intelligent routing**: Auto, Economy, Balanced, Premium modes
- **300+ models** via OpenRouter — from $0.03/1K to $30/1K tokens
- **Stream-first**: Responses stream immediately, quality checked in background

### OpenBook
- Upload documents, URLs, or text
- Generate: summaries, flashcards, study guides, podcasts, mind maps
- Hybrid RAG search (keyword + vector + RRF ranking)
- Two-phase podcast generation with TTS

### Research Chat
- Deep web research with Serper API
- Human-in-the-loop plan approval
- Cited reports with source attribution

### Team Management
- Role-based access: owner, admin, member
- Per-user credit limits and balances
- Conversation sharing with collaborative editing

### Usage Analytics
- Per-model token usage tracking
- Pipeline breakdown: classified / escalated
- Daily activity charts
- Credit cost tracking

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, standalone output) |
| Language | TypeScript 5.9 |
| UI | React 19.2, Tailwind CSS 4.2, Lucide Icons |
| AI Models | OpenRouter API (300+ models — Gemini, DeepSeek, Claude, GPT, etc.) |
| Database | PostgreSQL via Prisma ORM 7.5 |
| Cache | Redis |
| Auth | JWT (jose) + bcryptjs |
| Preview | Sandpack (CodeSandbox) |
| Containers | Docker + Traefik |
| Git | GitHub API (commits, file tree, content) |
| Search | Serper.dev (web research) |
| Hosting | Hetzner VPS + Cloudflare DNS/SSL |
| CI/CD | GitHub Actions → GHCR → auto-deploy |

---

## Infrastructure

Each user gets a dedicated VPS with containers:

```
[Traefik] ─── reverse proxy, SSL termination
[PostgreSQL] ─ project databases
[Redis] ────── caching, pub/sub
[VibeCoder] ── the IDE (this app)
[Playwright] ─ browser automation MCP
[Build-Env] ── isolated build environment
```

- **Cloud-init** provisions everything automatically
- **Wildcard SSL** via Cloudflare origin certificates
- **Flat subdomains**: `project.slug.domain.co`
- **GHCR** for container image registry

---

## Deploy Locally (Localhost)

Run VibeCoder on your own machine in under 2 minutes.

### Prerequisites

| Requirement | Version | Install |
|-------------|---------|---------|
| Node.js | 22+ | [nodejs.org](https://nodejs.org) |
| PostgreSQL | 16+ | `brew install postgresql@17` or [postgresql.org](https://www.postgresql.org/download/) |
| Redis | 7+ | `brew install redis` or [redis.io](https://redis.io/download/) |
| Git | any | `brew install git` |

You also need:
- **[OpenRouter API key](https://openrouter.ai/keys)** — powers all AI (classification, code research, planning, generation, auto-fix)
- **[GitHub PAT](https://github.com/settings/tokens)** — for creating repos and committing AI-generated code (scopes: `repo`, `write:packages`)
- **[Serper.dev API key](https://serper.dev/api-key)** *(optional)* — enables web research for best practices before planning

### Option A: Run with Node.js (fastest)

```bash
# 1. Clone and install
git clone https://github.com/dublyo/vibecoder.git
cd vibecoder
npm install

# 2. Configure environment
cp .env.example .env
```

Edit `.env` with your values:
```env
# Database (create a local PostgreSQL database first)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vibecoder"

# Cache
REDIS_URL="redis://localhost:6379"

# Auth
JWT_SECRET="any-random-string-here-min-32-chars"

# AI — Required (get from openrouter.ai/keys)
OPENROUTER_API_KEY="sk-or-v1-your-key-here"

# GitHub — Required (get from github.com/settings/tokens)
GITHUB_PAT="ghp_your-token-here"
GITHUB_OWNER="your-github-username"

# Web Research — Optional (get from serper.dev/api-key)
# Add via Settings page after first run
```

```bash
# 3. Setup database
npx prisma generate
npx prisma db push

# 4. Start
npm run dev
```

Open **http://localhost:3000** — complete the setup wizard, then start building.

### Option B: Run with Docker Compose (zero dependencies)

Only requires Docker Desktop — no Node.js, PostgreSQL, or Redis install needed.

```bash
# 1. Clone
git clone https://github.com/dublyo/vibecoder.git
cd vibecoder

# 2. Configure
cp .env.example .env
# Edit .env with your OPENROUTER_API_KEY, GITHUB_PAT, GITHUB_OWNER

# 3. Start everything (app + postgres + redis)
docker compose up --build
```

Open **http://localhost:3000** — everything is running.

### First Run

1. Navigate to **http://localhost:3000/setup**
2. Enter your **OpenRouter API key** (required for all AI features)
3. Optionally enter your **Serper.dev API key** (for web research)
4. Login with the default account or create your own
5. Click **New Project**, describe your app, and watch VibeCoder build it

### API Keys Explained

```
                  Your Message
                      |
                      v
    [Classifier] ---- OpenRouter (cheap model — e.g. Gemini Flash)
                      |
         +-----------+-----------+
         |                       |
  [Code Research]         [Web Research]
  OpenRouter              Serper.dev
  (cheap model)           (2,500 free searches)
         |                       |
         +-----------+-----------+
                      |
              [Plan + Generate]
              OpenRouter
              (mid model — e.g. DeepSeek V3)
                      |
              [Auto-Fix if needed]
              OpenRouter
              (mid model, or maestro if needed)
```

**OpenRouter** is the only required API key. It gives you access to **300+ models** from one key. VibeCoder uses cheap models by default (~$0.10-0.27/1M tokens) and only escalates to your chosen maestro model (Claude Opus 4.6, Gemini Pro 3.1, GPT-5.4, etc.) when cheap models fail. OpenRouter provides **free credits every month** — enough to build several apps.

**Serper.dev** is optional but recommended. It enables the web research phase that searches for best practices before the AI plans your app. Without it, the AI still works — it just skips the research step.

---

## Credits System

1 credit = $0.001 USD equivalent. Credits are calculated from actual token usage:

```
credits = (inputTokens * inputCostPer1K + outputTokens * outputCostPer1K)
```

Example costs per AI action:
- Simple code edit (Gemini Flash direct): ~0.5 credits
- Full app generation (Maestro pipeline): ~5-15 credits
- Code research analysis: ~0.1 credits
- Web research + planning: ~2 credits

---

## License

[Sustainable Use License](https://github.com/dublyo/vibecoder/blob/main/LICENSE.md) — a [fair-code](https://faircode.io) software license.

You can use VibeCoder freely for personal and commercial use. You can modify and self-host it. You cannot redistribute it as a competing product or offer it as a managed service without permission. Similar to [n8n](https://github.com/n8n-io/n8n).
