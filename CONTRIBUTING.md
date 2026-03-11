# Contributing to VibeCoder

We love contributions! VibeCoder is a fair-code project and we welcome improvements from the community.

## Ways to Contribute

- **Bug Reports** — Found a bug? Open an [issue](https://github.com/dublyo/vibecoder/issues) with steps to reproduce
- **Feature Requests** — Have an idea? Open an [issue](https://github.com/dublyo/vibecoder/issues) and describe the feature
- **Code Contributions** — Fix bugs, add features, improve docs
- **AI Prompts** — Help improve the AI pipeline prompts for better code generation
- **Translations** — Help translate the UI to more languages
- **Documentation** — Improve the README, add guides, write tutorials

## Getting Started

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/vibecoder.git
cd vibecoder
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Fill in your API keys (see README for details)
```

### 3. Run Locally

```bash
npx prisma generate
npx prisma db push
npm run dev
```

### 4. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

## Pull Request Guidelines

1. **One PR per feature/fix** — Keep PRs focused and reviewable
2. **Describe what changed** — Include a clear summary in the PR description
3. **Test your changes** — Make sure the app builds (`npm run build`) and works
4. **Follow existing patterns** — Match the code style and conventions already in the codebase
5. **Don't break the pipeline** — If you modify AI prompts or the pipeline, test with a real project

## Code Style

- **TypeScript** — All code is TypeScript, no `any` unless absolutely necessary
- **Functional** — Prefer functions over classes
- **Named exports** — Use `export function` or `export { name }`, not just `export default`
- **Tailwind CSS** — All UI styling via Tailwind, no CSS modules or styled-components
- **Prisma** — Database access through Prisma ORM only

## Project Structure

```
src/
├── app/              # Next.js App Router pages and API routes
├── components/       # React components
│   ├── vibecoder/    # VibeCoder IDE components
│   └── ...           # Shared components
├── lib/              # Core logic
│   ├── vibecoder/    # AI pipeline (classifier, pipeline, code-research, etc.)
│   ├── router/       # Smart chat routing engine
│   ├── research/     # Web research (Serper)
│   └── ...           # Auth, credits, DB, OpenRouter client
└── prisma/           # Database schema
```

## Key Areas for Contribution

### AI Pipeline (`src/lib/vibecoder/`)
The heart of VibeCoder. Improvements to code research, planning, and generation prompts have the biggest impact on output quality.

- `pipeline.ts` — Main orchestrator (classify → research → plan → generate → commit)
- `code-research.ts` — Analyzes existing codebase before generation
- `research-plan.ts` — Web research + architecture planning
- `classifier.ts` — Intent classification (direct vs maestro tier)
- `ralph-loop.ts` — Auto-fix loop for build errors

### IDE UI (`src/components/vibecoder/`)
The browser-based IDE interface.

- `chat-panel.tsx` — Chat input and AI response rendering
- `browser-tab.tsx` — Sandpack preview with Next.js shims
- `code-tab.tsx` — File tree and code viewer
- `terminal-tab.tsx` — Container terminal access

### Chat Engine (`src/lib/router/`)
The smart multi-model chat routing system.

- `pipeline.ts` — Routing logic (cheap → critic → escalate)
- `classifier.ts` — Multi-language intent classification
- `models.ts` — Model tier definitions and specialization

## Reporting Security Issues

If you find a security vulnerability, please do **not** open a public issue. Instead, email us at **security@vibecode.new** with details.

## License

By contributing, you agree that your contributions will be licensed under the [Sustainable Use License](LICENSE.md).

---

Thank you for helping make VibeCoder better!
