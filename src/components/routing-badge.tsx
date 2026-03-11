'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Zap, ChevronDown } from './icons'

interface RoutingBadgeProps {
  mode: string
  onChangeMode: (mode: string) => void
}

const modes = [
  { id: 'auto', label: 'Auto', color: 'text-brand-500', description: 'Smart routing' },
  { id: 'economy', label: 'Economy', color: 'text-green-500', description: 'Cheapest models' },
  { id: 'balanced', label: 'Balanced', color: 'text-yellow-500', description: 'Quality + cost' },
  { id: 'premium', label: 'Premium', color: 'text-purple-500', description: 'Best models' },
]

export function RoutingBadge({ mode, onChangeMode }: RoutingBadgeProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = modes.find(m => m.id === mode) || modes[0]

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 py-1.5 px-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
      >
        <Zap className={cn('w-4 h-4', current.color)} />
        <span className="font-medium text-gray-700 dark:text-gray-300">{current.label}</span>
        <ChevronDown className={cn('w-3 h-3 text-gray-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => { onChangeMode(m.id); setOpen(false) }}
              className={cn(
                'w-full px-4 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3',
                mode === m.id && 'bg-gray-50 dark:bg-gray-700/50'
              )}
            >
              <Zap className={cn('w-4 h-4 shrink-0', m.color)} />
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{m.label}</p>
                <p className="text-xs text-gray-500">{m.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
