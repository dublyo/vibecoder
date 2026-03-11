// Model specialization map — which models are best for which task types
// Updated March 2026 with latest OpenRouter models
export type TaskType = 'quick_chat' | 'coding' | 'creative_writing' | 'math_reasoning' | 'analysis' | 'complex'

export const MODEL_SPECIALIZATIONS: Record<TaskType, string[]> = {
  quick_chat: [
    // Cheapest, fastest models for greetings and simple Q&A
    'liquid/lfm-2-24b-a2b',           // $0.03/$0.12 — ultra cheap
    'bytedance-seed/seed-2.0-mini',   // $0.10/$0.40
    'qwen/qwen3.5-flash-02-23',       // $0.10/$0.40
    'google/gemini-2.5-flash',        // $0.10/$0.40
    'stepfun/step-3.5-flash',         // $0.10/$0.30
    // Mid: for when cheap model is uncertain
    'openai/gpt-5.3-chat',            // $1.75/$14 — great general chat
    'minimax/minimax-m2.5',           // $0.29/$1.20
    // Premium: should never reach here for quick chat
    'anthropic/claude-opus-4.6',
  ],
  coding: [
    // Cheap: specialized coding models
    'qwen/qwen3-coder-next',          // $0.12/$0.75 — purpose-built for code
    'deepseek/deepseek-chat-v3-0324', // $0.27/$1.10 — strong coder
    'inception/mercury-2',            // $0.25/$0.75 — fast coding
    // Mid: premium coding
    'openai/gpt-5.3-codex',           // $1.75/$14 — OpenAI's code model
    'anthropic/claude-sonnet-4.6',    // $3.00/$15 — excellent coder
    'google/gemini-3.1-pro-preview',  // $2.00/$12
    // Premium: maestro for complex architecture
    'anthropic/claude-opus-4.6',      // $5/$25
    'openai/gpt-5.4-pro',            // $30/$180 — ultimate maestro
  ],
  creative_writing: [
    // Cheap: decent writers
    'minimax/minimax-m2.5',           // $0.29/$1.20 — good creative
    'qwen/qwen3.5-35b-a3b',          // $0.16/$1.30
    'meta-llama/llama-4-scout',       // $0.15/$0.60
    // Mid: premium writers
    'anthropic/claude-sonnet-4.6',    // $3.00/$15 — best writer mid-tier
    'openai/gpt-5.4',                // $2.50/$15
    'writer/palmyra-x5',             // $0.60/$6 — specialized writer
    // Premium
    'anthropic/claude-opus-4.6',
    'openai/gpt-5.4-pro',
  ],
  math_reasoning: [
    // Cheap: reasoning models
    'deepseek/deepseek-chat-v3-0324', // $0.27/$1.10
    'qwen/qwen3.5-397b-a17b',        // $0.39/$2.34 — large reasoning
    'inception/mercury-2',            // $0.25/$0.75
    // Mid: strong reasoners
    'deepseek/deepseek-r1',           // $0.55/$2.19 — dedicated reasoning
    'qwen/qwen3-max-thinking',        // $0.78/$3.90 — thinking model
    'google/gemini-3.1-pro-preview',  // $2.00/$12
    // Premium
    'openai/gpt-5.4-pro',            // $30/$180 — best reasoning
    'anthropic/claude-opus-4.6',
  ],
  analysis: [
    // Cheap: good at analysis
    'deepseek/deepseek-chat-v3-0324', // $0.27/$1.10
    'qwen/qwen3.5-397b-a17b',        // $0.39/$2.34
    'z-ai/glm-5',                    // $0.60/$1.90
    // Mid: strong analysis
    'google/gemini-3.1-pro-preview',  // $2.00/$12
    'openai/gpt-5.3-chat',           // $1.75/$14
    'anthropic/claude-sonnet-4.6',    // $3.00/$15
    // Premium
    'anthropic/claude-opus-4.6',
    'openai/gpt-5.4-pro',
  ],
  complex: [
    // Cheap: try cheap first even for complex
    'qwen/qwen3.5-397b-a17b',        // $0.39/$2.34 — large model
    'deepseek/deepseek-chat-v3-0324', // $0.27/$1.10
    'z-ai/glm-5',                    // $0.60/$1.90
    // Mid: strong all-rounders
    'openai/gpt-5.4',                // $2.50/$15
    'anthropic/claude-sonnet-4.6',    // $3.00/$15
    'google/gemini-3.1-pro-preview',  // $2.00/$12
    // Premium: maestro territory
    'anthropic/claude-opus-4.6',      // $5/$25
    'openai/gpt-5.4-pro',            // $30/$180
  ],
}

// Tier definitions — ordered by cost (cheapest first)
export const TIER_MODELS = {
  cheap: [
    'liquid/lfm-2-24b-a2b',
    'z-ai/glm-4.7-flash',
    'bytedance-seed/seed-2.0-mini',
    'stepfun/step-3.5-flash',
    'google/gemini-2.5-flash',
    'qwen/qwen3.5-flash-02-23',
    'qwen/qwen3-coder-next',
    'meta-llama/llama-4-scout',
    'upstage/solar-pro-3',
    'qwen/qwen3.5-35b-a3b',
    'google/gemini-3.1-flash-lite-preview',
    'inception/mercury-2',
    'deepseek/deepseek-chat-v3-0324',
    'minimax/minimax-m2.5',
  ],
  mid: [
    'qwen/qwen3.5-397b-a17b',
    'moonshotai/kimi-k2.5',
    'deepseek/deepseek-r1',
    'z-ai/glm-5',
    'writer/palmyra-x5',
    'qwen/qwen3-max-thinking',
    'openai/gpt-5.3-codex',
    'openai/gpt-5.3-chat',
    'google/gemini-3.1-pro-preview',
    'openai/gpt-5.4',
    'anthropic/claude-sonnet-4.6',
  ],
  premium: [
    'anthropic/claude-opus-4.6',
    'openai/gpt-5.4-pro',
  ],
}

export function getModelTier(modelId: string): 'cheap' | 'mid' | 'premium' {
  if (TIER_MODELS.cheap.includes(modelId)) return 'cheap'
  if (TIER_MODELS.mid.includes(modelId)) return 'mid'
  return 'premium'
}

export function getBestModelForTask(taskType: TaskType, tier: 'cheap' | 'mid' | 'premium'): string {
  const specialized = MODEL_SPECIALIZATIONS[taskType]
  const tierModels = TIER_MODELS[tier]
  // find first model that's in both the specialization list and the tier
  const match = specialized.find(m => tierModels.includes(m))
  if (match) return match
  // fallback to first model in tier
  return tierModels[0]
}
