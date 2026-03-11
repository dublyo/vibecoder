// Telemetry: Logs every pipeline stage for transparency and optimization

export interface PipelineStep {
  stage: string
  model?: string
  latencyMs: number
  tokens?: { inputTokens: number; outputTokens: number }
  cost?: number
  result?: string
}

export interface PipelineLog {
  steps: PipelineStep[]
  totalLatencyMs: number
  totalCost: number
  wasEscalated: boolean
  escalatedFrom?: string
  criticScore?: number
  finalModel: string
  taskType: string
  complexity: string
}

export function createPipelineLog(): PipelineStep[] {
  return []
}

export function addStep(
  steps: PipelineStep[],
  stage: string,
  data: Omit<PipelineStep, 'stage'>,
): void {
  steps.push({ stage, ...data })
}

export function finalizePipelineLog(
  steps: PipelineStep[],
  opts: {
    wasEscalated: boolean
    escalatedFrom?: string
    criticScore?: number
    finalModel: string
    taskType: string
    complexity: string
  },
): PipelineLog {
  const totalLatencyMs = steps.reduce((sum, s) => sum + s.latencyMs, 0)
  const totalCost = steps.reduce((sum, s) => sum + (s.cost || 0), 0)

  return {
    steps,
    totalLatencyMs,
    totalCost,
    ...opts,
  }
}
