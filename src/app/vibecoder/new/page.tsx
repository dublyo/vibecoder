'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2, Code2, GitBranch, Sparkles, CheckCircle2 } from 'lucide-react'

type Framework = 'nextjs' | 'nuxt' | 'astro'

const FRAMEWORKS: { id: Framework; name: string; icon: string; desc: string; color: string; bgColor: string }[] = [
  { id: 'nextjs', name: 'Next.js', icon: '▲', desc: 'React framework with SSR & API routes', color: 'border-gray-900 dark:border-white', bgColor: 'bg-black dark:bg-white' },
  { id: 'nuxt', name: 'Nuxt', icon: '💚', desc: 'Vue framework with auto-imports', color: 'border-green-500', bgColor: 'bg-green-500' },
  { id: 'astro', name: 'Astro', icon: '🚀', desc: 'Content-focused static sites', color: 'border-purple-500', bgColor: 'bg-purple-500' },
]

const TEMPLATES = [
  { id: 'blank', name: 'Blank', description: 'Empty project to start from scratch', icon: '✨' },
  { id: 'saas', name: 'SaaS Starter', description: 'Auth, dashboard, and billing pages', icon: '💼' },
  { id: 'blog', name: 'Blog', description: 'MDX blog with SEO optimization', icon: '📝' },
  { id: 'dashboard', name: 'Dashboard', description: 'Admin panel with charts & tables', icon: '📊' },
  { id: 'landing', name: 'Landing Page', description: 'Marketing site with CTA sections', icon: '🚀' },
  { id: 'portfolio', name: 'Portfolio', description: 'Personal website & showcase', icon: '🎨' },
  { id: 'ecommerce', name: 'E-Commerce', description: 'Product catalog & shopping cart', icon: '🛒' },
]

type WizardStep = 'name' | 'framework' | 'template' | 'creating'

export default function NewProjectPage() {
  const router = useRouter()
  const [step, setStep] = useState<WizardStep>('name')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [framework, setFramework] = useState<Framework>('nextjs')
  const [template, setTemplate] = useState('blank')
  const [importRepo, setImportRepo] = useState('')
  const [mode, setMode] = useState<'template' | 'import'>('template')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')
  const [createdProject, setCreatedProject] = useState<any>(null)

  const handleCreate = async () => {
    setIsCreating(true)
    setStep('creating')
    setError('')

    try {
      const body: any = {
        name: name.trim(),
        framework,
        description: description.trim() || undefined,
      }

      if (mode === 'template' && template !== 'blank') {
        body.template = template
      } else if (mode === 'import') {
        body.importRepo = importRepo.trim()
      }

      const res = await fetch('/api/vibecoder/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create project')
      }

      const data = await res.json()
      setCreatedProject(data.project)

      // Navigate to the project after a brief moment
      setTimeout(() => {
        router.push(`/vibecoder?project=${data.project.id}`)
      }, 1500)
    } catch (err: any) {
      setError(err.message)
      setStep('name')
      setIsCreating(false)
    }
  }

  const canProceedFromName = name.trim().length >= 2
  const canProceedFromFramework = true
  const canCreate = mode === 'template' || (mode === 'import' && importRepo.trim())

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Top bar */}
      <header className="h-14 flex items-center px-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button
          onClick={() => router.push('/vibecoder')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to projects
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Progress indicator */}
        <div className="flex items-center gap-3 mb-10">
          {(['name', 'framework', 'template'] as const).map((s, i) => {
            const labels = ['Project', 'Framework', 'Template']
            const isActive = s === step
            const isComplete = step === 'creating' ||
              (s === 'name' && (step === 'framework' || step === 'template')) ||
              (s === 'framework' && step === 'template')
            return (
              <div key={s} className="flex items-center gap-3 flex-1">
                <div className={`flex items-center gap-2 ${i > 0 ? '' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                    isComplete ? 'bg-brand-500 text-white' :
                    isActive ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' :
                    'bg-gray-200 dark:bg-gray-700 text-gray-500'
                  }`}>
                    {isComplete ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-sm font-medium ${
                    isActive || isComplete ? 'text-gray-900 dark:text-white' : 'text-gray-400'
                  }`}>{labels[i]}</span>
                </div>
                {i < 2 && (
                  <div className={`flex-1 h-px ${isComplete ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Step: Creating */}
        {step === 'creating' && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
              {createdProject ? (
                <CheckCircle2 className="w-8 h-8 text-white" />
              ) : (
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              )}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {createdProject ? 'Project Created!' : 'Setting up your project...'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              {createdProject
                ? `${createdProject.name} is ready. Redirecting to IDE...`
                : 'Creating GitHub repo, configuring CI/CD, and scaffolding files...'
              }
            </p>
            {!createdProject && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                <GitBranch className="w-4 h-4" />
                <span>This takes about 10-15 seconds</span>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Name */}
        {step === 'name' && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Create a new project
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Give your project a name and tell us what you're building.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Project name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Awesome App"
                  className="w-full px-4 py-3 text-base bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-shadow"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && canProceedFromName && setStep('framework')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what you want to build — the AI will use this to guide code generation..."
                  rows={3}
                  className="w-full px-4 py-3 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none transition-shadow"
                />
              </div>

              {error && (
                <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setStep('framework')}
                disabled={!canProceedFromName}
                className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Framework */}
        {step === 'framework' && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Choose your framework
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Pick the framework for <span className="font-medium text-gray-700 dark:text-gray-300">{name}</span>.
              </p>
            </div>

            <div className="space-y-3">
              {FRAMEWORKS.map(fw => (
                <button
                  key={fw.id}
                  onClick={() => setFramework(fw.id)}
                  className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all ${
                    framework === fw.id
                      ? `${fw.color} bg-white dark:bg-gray-900 shadow-sm`
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900'
                  }`}
                >
                  <span className="text-3xl">{fw.icon}</span>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 dark:text-white">{fw.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{fw.desc}</div>
                  </div>
                  {framework === fw.id && (
                    <CheckCircle2 className="w-5 h-5 text-brand-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setStep('name')}
                className="flex items-center gap-2 px-5 py-3 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={() => setStep('template')}
                disabled={!canProceedFromFramework}
                className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Template or Import */}
        {step === 'template' && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Start with a template
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Choose a starting point or import an existing repository.
              </p>
            </div>

            {/* Mode toggle */}
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-6">
              <button
                onClick={() => setMode('template')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  mode === 'template'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Templates
              </button>
              <button
                onClick={() => setMode('import')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  mode === 'import'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <GitBranch className="w-4 h-4" />
                Import Repo
              </button>
            </div>

            {mode === 'template' ? (
              <div className="grid grid-cols-2 gap-3">
                {TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all ${
                      template === t.id
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/10'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900'
                    }`}
                  >
                    <div className="text-2xl mb-2">{t.icon}</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{t.description}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  GitHub Repository
                </label>
                <input
                  type="text"
                  value={importRepo}
                  onChange={(e) => setImportRepo(e.target.value)}
                  placeholder="user/repo or https://github.com/user/repo"
                  className="w-full px-4 py-3 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-shadow"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-2">Framework will be auto-detected from the repository</p>
              </div>
            )}

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setStep('framework')}
                className="flex items-center gap-2 px-5 py-3 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || !canCreate}
                className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Code2 className="w-4 h-4" />
                    Create Project
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
