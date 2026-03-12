'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  RefreshCw, ArrowLeft, ArrowRight, ExternalLink, Monitor, Tablet, Smartphone,
  Loader2, Globe, Code2, Maximize2, Minimize2, RotateCcw, FileCode2, CheckCircle2, AlertCircle
} from 'lucide-react'
import { SandpackProvider, SandpackPreview, SandpackConsole } from '@codesandbox/sandpack-react'

interface BrowserTabProps {
  projectUrl: string
  projectId: string
  projectStatus: string
  generatedFiles?: Record<string, string>
}

type ViewMode = 'desktop' | 'tablet' | 'mobile'
type PreviewMode = 'sandbox' | 'deployed'

const VIEW_WIDTHS: Record<ViewMode, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '375px',
}

type SandpackTemplate = 'react' | 'react-ts' | 'static'

/** Detect if content uses TypeScript syntax */
function hasTypeScript(files: Record<string, string>): boolean {
  return Object.entries(files).some(([path, content]) =>
    path.endsWith('.tsx') || path.endsWith('.ts') ||
    /:\s*(string|number|boolean|any|void)\b/.test(content) ||
    /<\w+(\[\])?>/.test(content) && /useState|interface|type\s/.test(content)
  )
}

/** Patch CDN-style React code to use proper ES module imports for Sandpack */
function patchCdnToModules(content: string): string {
  let patched = content

  // Remove "// @ts-nocheck" — Sandpack handles TS natively
  patched = patched.replace(/\/\/\s*@ts-nocheck\s*\n?/g, '')

  // Replace `const { useState, ... } = React;` with proper import
  const destructureMatch = patched.match(/^const\s*\{([^}]+)\}\s*=\s*React\s*;?\s*$/m)
  if (destructureMatch) {
    const hooks = destructureMatch[1].trim()
    patched = patched.replace(destructureMatch[0], `import React, { ${hooks} } from 'react';`)
  } else if (!/import\s.*from\s+['"]react['"]/.test(patched)) {
    // No React import — detect which hooks/APIs are used and add proper import
    const reactHooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer']
    const usedHooks = reactHooks.filter(h => new RegExp(`\\b${h}\\b`).test(patched))
    if (usedHooks.length > 0) {
      patched = `import React, { ${usedHooks.join(', ')} } from 'react';\n${patched}`
    } else if (/\bReact\b/.test(patched)) {
      patched = `import React from 'react';\n${patched}`
    }
  }

  // Remove ReactDOM mount block — Sandpack's /index.tsx handles mounting
  if (/\bReactDOM\b/.test(patched) && !/import\s.*\bReactDOM\b/.test(patched)) {
    patched = patched.replace(/\/\/\s*Mount\s*\n?/g, '')
    // Remove two-line pattern: const root = ReactDOM.createRoot(...); root.render(...);
    patched = patched.replace(/const\s+root\s*=\s*ReactDOM\.createRoot\(.*\)\s*;?\s*\n\s*root\.render\(.*\)\s*;?\s*/g, '')
    // Remove one-liner: ReactDOM.createRoot(...).render(...)
    patched = patched.replace(/ReactDOM\.createRoot\(.*?\)\.render\(.*?\)\s*;?\s*/g, '')
  }

  // Ensure there's an `export default` if none exists
  if (!/export\s+default\b/.test(patched)) {
    // Try common patterns in order of specificity
    const exportPatterns: [RegExp, string][] = [
      // function App(
      [/^(function\s+App\s*\()/m, 'export default $1'],
      // const App = (
      [/^(const\s+App\s*=\s*)/m, 'export default $1'.replace('const ', '').replace('= ', '')],
      // function SomeComponent( — any PascalCase function
      [/^(function\s+[A-Z]\w+\s*\()/m, 'export default $1'],
      // const SomeComponent = (
      [/^(const\s+[A-Z]\w+\s*=\s*(?:\([^)]*\)|[^=])\s*=>)/m, 'export default $1'],
    ]

    let matched = false
    for (const [pattern, replacement] of exportPatterns) {
      if (pattern.test(patched)) {
        patched = patched.replace(pattern, replacement)
        matched = true
        break
      }
    }

    // Last resort: if there's a named export like `export function X`, convert to default
    if (!matched && /export\s+function\s+\w+/.test(patched)) {
      patched = patched.replace(/^(export)\s+(function\s+\w+)/m, '$1 default $2')
    }

    // Final fallback: wrap entire content as default export if nothing matched
    if (!matched && !/export\s+default\b/.test(patched)) {
      // Find last function/const that looks like a component
      const componentMatch = patched.match(/(?:function|const)\s+([A-Z]\w+)/)
      if (componentMatch) {
        patched += `\nexport default ${componentMatch[1]};`
      }
    }
  }

  return patched
}

/** Rewrite @/ path aliases to / since Sandpack doesn't support tsconfig paths */
function rewritePathAliases(content: string): string {
  // from '@/components/Hero' → from '/components/Hero'
  let patched = content.replace(/(from\s+['"])@\//g, '$1/')
  // import('@/components/Hero') → import('/components/Hero')
  patched = patched.replace(/(import\s*\(\s*['"])@\//g, '$1/')
  // import '@/styles/globals.css' → import '/styles/globals.css'
  patched = patched.replace(/(import\s+['"])@\//g, '$1/')
  return patched
}

/** Shim files for Next.js modules that don't exist in Sandpack */
const NEXTJS_SHIMS: Record<string, string> = {
  '/next/link.js': `import React, { useCallback } from 'react';
const Link = React.forwardRef(({ href, children, ...props }, ref) => {
  const handleClick = useCallback((e) => {
    if (href && href.startsWith('/')) {
      e.preventDefault();
      window.location.hash = href;
    }
  }, [href]);
  return React.createElement('a', { href: href || '#', ref, onClick: handleClick, ...props }, children);
});
Link.displayName = 'Link';
export default Link;`,
  '/next/image.js': `import React from 'react';
const Image = React.forwardRef(({ src, alt, width, height, fill, ...props }, ref) =>
  React.createElement('img', { src, alt, width: fill ? '100%' : width, height: fill ? '100%' : height, ref, style: fill ? { objectFit: 'cover', width: '100%', height: '100%', ...(props.style || {}) } : props.style, ...props })
);
Image.displayName = 'Image';
export default Image;`,
  '/next/navigation.js': `import { useState, useEffect } from 'react';
function getPath() { return window.location.hash.slice(1) || '/'; }
export function useRouter() {
  return {
    push: (url) => { window.location.hash = url; },
    back: () => window.history.back(),
    replace: (url) => { window.location.hash = url; },
    pathname: getPath(),
  };
}
export function usePathname() {
  const [path, setPath] = useState(getPath());
  useEffect(() => {
    const handler = () => setPath(getPath());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return path;
}
export function useSearchParams() { return new URLSearchParams(window.location.search); }
export function useParams() { return {}; }
export function redirect(url) { window.location.hash = url; }`,
  '/next/font/google.js': `export function Inter() { return { className: '' }; }
export function Roboto() { return { className: '' }; }
export function Open_Sans() { return { className: '' }; }
export function Poppins() { return { className: '' }; }
export default function googleFont() { return { className: '' }; }`,
  '/next-auth.js': `export default function NextAuth() { return { handlers: { GET() {}, POST() {} }, auth: async () => null, signIn: async () => {}, signOut: async () => {} }; }
export function getServerSession() { return Promise.resolve(null); }`,
  '/next-auth/react.js': `import React from 'react';
export function useSession() { return { data: null, status: 'unauthenticated' }; }
export function signIn() { return Promise.resolve(); }
export function signOut() { return Promise.resolve(); }
export function SessionProvider({ children }) { return children; }
export function getCsrfToken() { return Promise.resolve(''); }`,
  '/@auth/prisma-adapter.js': `export function PrismaAdapter() { return {}; }`,
}

/**
 * Build a simple hash-based router App.tsx when multiple page.tsx files exist.
 * This allows browsing between pages in the Sandpack preview.
 */
function buildRouterEntry(sandpackFiles: Record<string, string>, useTS: boolean): string {
  // Find all page files (after normalization, they look like /page.tsx, /listings/page.tsx, etc.)
  const pageFiles = Object.keys(sandpackFiles).filter(k =>
    /\/page\.(tsx|jsx|js|ts)$/.test(k)
  )

  if (pageFiles.length <= 1) return '' // No router needed

  // Build route map: /page.tsx → "/", /listings/page.tsx → "/listings"
  const routes: { path: string; file: string; importName: string }[] = []
  for (const file of pageFiles) {
    const dir = file.replace(/\/page\.(tsx|jsx|js|ts)$/, '') || '/'
    const routePath = dir === '' ? '/' : dir
    // Create safe import name from path
    const importName = 'Page' + routePath
      .replace(/^\//, '')
      .replace(/\//g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '') || 'Home'
    routes.push({ path: routePath, file, importName: importName || 'PageHome' })
  }

  // Generate router code
  const imports = routes.map(r =>
    `import ${r.importName} from '${r.file.replace(/\.(tsx|jsx|ts)$/, '')}';`
  ).join('\n')

  const routeEntries = routes.map(r =>
    `  '${r.path}': ${r.importName},`
  ).join('\n')

  return `import React, { useState, useEffect } from 'react';
${imports}

const routes${useTS ? ': Record<string, React.ComponentType>' : ''} = {
${routeEntries}
};

function getHashPath() {
  return window.location.hash.slice(1) || '/';
}

export default function App() {
  const [path, setPath] = useState(getHashPath());

  useEffect(() => {
    const handler = () => setPath(getHashPath());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // Intercept all <a> clicks to use hash routing
  useEffect(() => {
    const handler = (e${useTS ? ': MouseEvent' : ''}) => {
      const a = (e.target${useTS ? ' as HTMLElement' : ''}).closest('a');
      if (a && a.getAttribute('href')?.startsWith('/')) {
        e.preventDefault();
        window.location.hash = a.getAttribute('href')${useTS ? '!' : ''};
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Find matching route
  const Page = routes[path];
  if (!Page) {
    return (
      <div style={{minHeight:'60vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'system-ui',color:'#666'}}>
        <div style={{fontSize:'3rem',marginBottom:'0.5rem'}}>404</div>
        <div style={{fontSize:'1.1rem',marginBottom:'1rem'}}>Page <code style={{background:'#f0f0f0',padding:'2px 8px',borderRadius:4}}>{path}</code> not found</div>
        <div style={{fontSize:'0.85rem',color:'#999',marginBottom:'1.5rem'}}>This page hasn't been created yet in the sandbox preview.</div>
        <a href="#/" style={{color:'#6366f1',textDecoration:'none',fontWeight:500}}>← Back to Home</a>
      </div>
    );
  }
  return <Page />;
}
`
}

/** Normalize Next.js src/app paths to flat Sandpack paths */
function normalizePath(path: string): string {
  let key = path.startsWith('/') ? path : `/${path}`
  // Strip src/ prefix: src/components/X → /components/X
  key = key.replace(/^\/src\//, '/')
  // Strip app/ prefix for page/layout: app/page.tsx → /page.tsx
  key = key.replace(/^\/app\//, '/')
  return key
}

/** Convert project files (path → content) to Sandpack format (/path → content) */
function toSandpackFiles(files: Record<string, string>): { files: Record<string, string>; template: SandpackTemplate } {
  const sandpackFiles: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    const key = normalizePath(path)
    // Patch all React/TSX files for Sandpack module compatibility
    const isReactFile = /\.(tsx|jsx|js|ts)$/.test(key) && !key.includes('config')
    sandpackFiles[key] = isReactFile ? rewritePathAliases(patchCdnToModules(content)) : content
  }

  // If files are pure HTML (no JS/JSX), use static template
  const paths = Object.keys(sandpackFiles)
  const hasHtml = paths.some(p => p.endsWith('.html'))
  const hasJsx = paths.some(p => /\.(tsx|jsx|js|ts)$/.test(p) && !p.includes('config'))
  if (hasHtml && !hasJsx) {
    if (!sandpackFiles['/index.html']) {
      const htmlFile = Object.entries(sandpackFiles).find(([k]) => k.endsWith('.html'))
      if (htmlFile) sandpackFiles['/index.html'] = htmlFile[1]
    }
    return { files: sandpackFiles, template: 'static' }
  }

  // Detect TypeScript
  const useTS = hasTypeScript(files)
  const entryFile = useTS ? '/App.tsx' : '/App.js'

  if (!sandpackFiles['/App.js'] && !sandpackFiles['/App.tsx'] && !sandpackFiles['/App.jsx']) {
    // Try to build a multi-page router if there are multiple page.tsx files
    const routerCode = buildRouterEntry(sandpackFiles, useTS)

    if (routerCode) {
      // Multi-page app: use generated router as entry
      sandpackFiles[entryFile] = routerCode
    } else {
      // Single-page: map the first suitable file to App.tsx
      const entryMappings = [
        '/index.tsx', '/index.jsx', '/index.js',
        '/page.tsx', '/page.jsx', '/page.js',
      ]

      let mappedFrom: string | null = null
      for (const candidate of entryMappings) {
        if (sandpackFiles[candidate]) {
          sandpackFiles[entryFile] = sandpackFiles[candidate]
          mappedFrom = candidate
          break
        }
      }

      if (!mappedFrom) {
        const firstComponent = Object.entries(sandpackFiles).find(([k]) =>
          /\.(tsx|jsx|js|ts)$/.test(k) && !k.includes('config') && !k.includes('.d.ts')
        )
        if (firstComponent) {
          sandpackFiles[entryFile] = firstComponent[1]
          mappedFrom = firstComponent[0]
        }
      }

      if (mappedFrom && (mappedFrom === '/index.tsx' || mappedFrom === '/index.jsx' || mappedFrom === '/index.js')) {
        delete sandpackFiles[mappedFrom]
      }
    }
  }

  // Inject Next.js shims if any file imports from next/* or next-auth
  const allContent = Object.values(sandpackFiles).join('\n')
  if (/from\s+['"]next\//.test(allContent) || /from\s+['"]next-auth/.test(allContent) || /from\s+['"]@auth\//.test(allContent)) {
    for (const [shimPath, shimContent] of Object.entries(NEXTJS_SHIMS)) {
      sandpackFiles[shimPath] = shimContent
    }
  }

  // Remove server-only files that can't run in Sandpack (Node.js APIs, auth config, API routes, middleware)
  const serverOnlyPatterns = [
    /\/layout\.(tsx|jsx)$/,
    /\/loading\.(tsx|jsx)$/,
    /\/error\.(tsx|jsx)$/,
    /\/not-found\.(tsx|jsx)$/,
    /\/api\//, // API routes need Node.js
    /\/auth\.(ts|js|tsx|jsx)$/, // auth.ts / auth.js (next-auth config)
    /\/middleware\.(ts|js)$/, // Next.js middleware
    /\/lib\/auth/, // auth utility files
    /\/server\//, // server-only code
    /prisma/, // Prisma client needs Node.js
  ]
  for (const key of Object.keys(sandpackFiles)) {
    if (serverOnlyPatterns.some(p => p.test(key))) {
      delete sandpackFiles[key]
    }
  }

  return { files: sandpackFiles, template: useTS ? 'react-ts' : 'react' }
}

export function BrowserTab({ projectUrl, projectId, projectStatus, generatedFiles }: BrowserTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('sandbox')
  const [isLoading, setIsLoading] = useState(false)
  const [isDeployedLive, setIsDeployedLive] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [sandpackKey, setSandpackKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Check if deployed URL is actually live, auto-switch to live when available
  useEffect(() => {
    if (!projectUrl) return
    let wasLive = false
    const check = async () => {
      try {
        await fetch(projectUrl, { method: 'HEAD', mode: 'no-cors' })
        if (!wasLive) {
          wasLive = true
          setIsDeployedLive(true)
        }
      } catch {
        setIsDeployedLive(false)
        wasLive = false
      }
    }
    check()
    const interval = setInterval(check, 15000)
    return () => clearInterval(interval)
  }, [projectUrl])

  // Auto-refresh live iframe when project status transitions from deploying to active
  const prevStatusRef = useRef(projectStatus)
  useEffect(() => {
    if (prevStatusRef.current === 'deploying' && projectStatus === 'active') {
      // Deploy just completed, refresh preview
      setTimeout(() => {
        if (previewMode === 'deployed' && iframeRef.current) {
          iframeRef.current.src = projectUrl
        }
      }, 3000) // Wait 3s for container to fully start
    }
    prevStatusRef.current = projectStatus
  }, [projectStatus, previewMode, projectUrl])

  const refresh = useCallback(() => {
    if (previewMode === 'deployed' && iframeRef.current) {
      setIsLoading(true)
      iframeRef.current.src = projectUrl
    } else if (previewMode === 'sandbox') {
      setSandpackKey(k => k + 1)
    }
  }, [projectUrl, previewMode])

  const sandpackResult = useMemo(() => {
    if (!generatedFiles || Object.keys(generatedFiles).length === 0) return null
    return toSandpackFiles(generatedFiles)
  }, [generatedFiles])

  const viewModes: { id: ViewMode; icon: typeof Monitor; label: string }[] = [
    { id: 'desktop', icon: Monitor, label: 'Desktop' },
    { id: 'tablet', icon: Tablet, label: 'Tablet' },
    { id: 'mobile', icon: Smartphone, label: 'Mobile' },
  ]

  const hasGeneratedCode = sandpackResult && Object.keys(sandpackResult.files).length > 0
  const fileCount = generatedFiles ? Object.keys(generatedFiles).length : 0

  // Only show "creating" spinner if we have no generated code to preview
  if ((projectStatus === 'creating' || projectStatus === 'building') && !hasGeneratedCode) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
        <div className="text-center">
          <div className="relative inline-flex">
            <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin relative" />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mt-4">
            {projectStatus === 'creating' ? 'Setting up your project...' : 'Building your app...'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">This may take a minute</p>
          <div className="mt-4 flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Enhanced URL Bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        {/* Preview mode toggle */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setPreviewMode('sandbox')}
            title="Sandbox Preview (instant)"
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
              previewMode === 'sandbox'
                ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sandbox</span>
          </button>
          <button
            onClick={() => setPreviewMode('deployed')}
            title="Deployed Site"
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
              previewMode === 'deployed'
                ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Live</span>
          </button>
        </div>

        {/* Navigation controls */}
        {previewMode === 'deployed' && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => iframeRef.current?.contentWindow?.history.back()}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => iframeRef.current?.contentWindow?.history.forward()}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Refresh button (works for both modes) */}
        <button
          onClick={refresh}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          title="Refresh preview"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>

        {/* URL display */}
        <div className="flex-1 flex items-center bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono truncate border border-gray-200 dark:border-gray-700">
          {previewMode === 'sandbox' ? (
            <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                <span className="text-green-600 dark:text-green-400 font-semibold">sandbox</span>
              </span>
              <span className="text-gray-400">://</span>
              <span>preview</span>
              {fileCount > 0 && (
                <span className="ml-auto flex items-center gap-1 text-gray-400">
                  <FileCode2 className="w-3 h-3" />
                  {fileCount} file{fileCount !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              {isDeployedLive ? (
                <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
              )}
              <span className="truncate">{projectUrl}</span>
            </span>
          )}
        </div>

        {/* External link */}
        {previewMode === 'deployed' && (
          <a
            href={projectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-md transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}

        {/* Console toggle (sandbox mode only) */}
        {previewMode === 'sandbox' && hasGeneratedCode && (
          <button
            onClick={() => setShowConsole(!showConsole)}
            className={`p-1.5 rounded-md transition-colors ${
              showConsole
                ? 'text-brand-500 bg-brand-50 dark:bg-brand-900/20'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            title="Toggle console"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Viewport size controls */}
        <div className="flex items-center border-l border-gray-200 dark:border-gray-700 pl-2 gap-0.5">
          {viewModes.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              title={label}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === id
                  ? 'text-brand-500 bg-brand-50 dark:bg-brand-900/20 shadow-sm'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className={`flex-1 flex items-start justify-center overflow-auto ${viewMode !== 'desktop' ? 'p-4' : ''}`}>
          <div
            className={`bg-white dark:bg-gray-900 h-full transition-all duration-300 ${
              viewMode !== 'desktop'
                ? 'rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 ring-1 ring-gray-100 dark:ring-gray-800'
                : 'w-full'
            }`}
            style={viewMode !== 'desktop' ? { width: VIEW_WIDTHS[viewMode], maxWidth: '100%' } : undefined}
          >
            {previewMode === 'sandbox' ? (
              hasGeneratedCode ? (
                <div className="h-full w-full flex flex-col">
                  <SandpackProvider
                    key={sandpackKey}
                    template={sandpackResult!.template}
                    theme="dark"
                    files={sandpackResult!.files}
                    options={{
                      autorun: true,
                      autoReload: true,
                      externalResources: ['https://cdn.tailwindcss.com'],
                    }}
                    style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
                  >
                    <div style={{ flex: showConsole ? '0 0 65%' : '1 1 auto', minHeight: 0, height: showConsole ? '65%' : '100%' }}>
                      <SandpackPreview
                        style={{ height: '100%', width: '100%' }}
                        showOpenInCodeSandbox={false}
                        showRefreshButton={false}
                      />
                    </div>
                    {showConsole && (
                      <div style={{ flex: '0 0 35%', minHeight: '100px' }} className="border-t border-gray-700 bg-gray-950">
                        <SandpackConsole style={{ height: '100%' }} />
                      </div>
                    )}
                  </SandpackProvider>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">
                  <div className="text-center px-8 py-12">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                      <Code2 className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                    </div>
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">No preview yet</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[240px] leading-relaxed">
                      Send a message to generate code and see an instant preview here
                    </p>
                  </div>
                </div>
              )
            ) : isDeployedLive ? (
              <>
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-10">
                    <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  src={projectUrl}
                  className="w-full h-full border-0"
                  onLoad={() => setIsLoading(false)}
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                  title="Project Preview"
                />
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center px-8 py-12">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                    <Globe className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                  </div>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">Not deployed yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[240px] leading-relaxed">
                    Use the Sandbox preview for instant results, or deploy your project to see it live here
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status bar */}
        {hasGeneratedCode && previewMode === 'sandbox' && (
          <div className="flex items-center justify-between px-3 py-1 bg-gray-900 border-t border-gray-800 text-[10px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Sandpack {sandpackResult?.template}
            </span>
            <span>{fileCount} source file{fileCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}
