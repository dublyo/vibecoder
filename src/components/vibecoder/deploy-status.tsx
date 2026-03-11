'use client'

import { Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react'

interface DeployStatusProps {
  status: string
  deploymentId?: string
  onClick?: () => void
}

const STATUS_MAP: Record<string, {
  icon: typeof Circle
  color: string
  bgColor: string
  label: string
  animate?: boolean
}> = {
  creating: {
    icon: Loader2, color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    label: 'Setting up...', animate: true,
  },
  building: {
    icon: Loader2, color: 'text-yellow-500', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    label: 'Building...', animate: true,
  },
  deploying: {
    icon: Loader2, color: 'text-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    label: 'Deploying...', animate: true,
  },
  live: {
    icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-50 dark:bg-green-900/20',
    label: 'Live!',
  },
  active: {
    icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-50 dark:bg-green-900/20',
    label: 'Active',
  },
  failed: {
    icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50 dark:bg-red-900/20',
    label: 'Failed',
  },
  error: {
    icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50 dark:bg-red-900/20',
    label: 'Error',
  },
  testing: {
    icon: Loader2, color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    label: 'Testing...', animate: true,
  },
  pending: {
    icon: Circle, color: 'text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-800',
    label: 'Pending',
  },
  paused: {
    icon: Circle, color: 'text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-800',
    label: 'Paused',
  },
}

export function DeployStatus({ status, deploymentId, onClick }: DeployStatusProps) {
  const config = STATUS_MAP[status] || STATUS_MAP.pending
  const Icon = config.icon

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${config.bgColor} ${config.color} ${
        onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
      }`}
    >
      <Icon className={`w-3 h-3 ${config.animate ? 'animate-spin' : ''}`} />
      {config.label}
    </button>
  )
}
