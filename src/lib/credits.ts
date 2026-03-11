import { prisma } from './db'

// 1 credit = $0.001 USD equivalent
// Credits per 1K tokens based on OpenRouter pricing (March 2026)
// contextWindow = max input tokens the model supports
export interface ModelConfig {
  input: number
  output: number
  tier: string
  label: string
  contextWindow: number // max input tokens
}

export const MODEL_CREDIT_RATES: Record<string, ModelConfig> = {
  // === BUDGET TIER ===
  // Ultra-cheap models for simple tasks, greetings, quick Q&A
  'liquid/lfm-2-24b-a2b':            { input: 0.03, output: 0.12, tier: 'cheap', label: 'Liquid LFM 2 24B', contextWindow: 32768 },
  'z-ai/glm-4.7-flash':              { input: 0.06, output: 0.40, tier: 'cheap', label: 'GLM 4.7 Flash', contextWindow: 128000 },
  'bytedance-seed/seed-2.0-mini':    { input: 0.10, output: 0.40, tier: 'cheap', label: 'Seed 2.0 Mini', contextWindow: 32768 },
  'stepfun/step-3.5-flash':          { input: 0.10, output: 0.30, tier: 'cheap', label: 'Step 3.5 Flash', contextWindow: 32768 },
  'google/gemini-2.0-flash-001':     { input: 0.10, output: 0.40, tier: 'cheap', label: 'Gemini Flash 2.0', contextWindow: 1048576 },
  'qwen/qwen3.5-flash-02-23':        { input: 0.10, output: 0.40, tier: 'cheap', label: 'Qwen 3.5 Flash', contextWindow: 131072 },
  'qwen/qwen3-coder-next':           { input: 0.12, output: 0.75, tier: 'cheap', label: 'Qwen 3 Coder Next', contextWindow: 131072 },
  'meta-llama/llama-4-scout':        { input: 0.15, output: 0.60, tier: 'cheap', label: 'Llama 4 Scout', contextWindow: 131072 },
  'upstage/solar-pro-3':             { input: 0.15, output: 0.60, tier: 'cheap', label: 'Solar Pro 3', contextWindow: 32768 },
  'qwen/qwen3.5-35b-a3b':            { input: 0.16, output: 1.30, tier: 'cheap', label: 'Qwen 3.5 35B', contextWindow: 131072 },
  'google/gemini-3.1-flash-lite-preview': { input: 0.25, output: 1.50, tier: 'cheap', label: 'Gemini 3.1 Flash Lite', contextWindow: 1048576 },
  'inception/mercury-2':             { input: 0.25, output: 0.75, tier: 'cheap', label: 'Mercury 2', contextWindow: 32768 },
  'deepseek/deepseek-chat-v3-0324':  { input: 0.27, output: 1.10, tier: 'cheap', label: 'DeepSeek V3', contextWindow: 65536 },
  'minimax/minimax-m2.5':            { input: 0.29, output: 1.20, tier: 'cheap', label: 'MiniMax M2.5', contextWindow: 131072 },

  // === MID TIER ===
  // Quality models for coding, writing, analysis
  'qwen/qwen3.5-397b-a17b':          { input: 0.39, output: 2.34, tier: 'mid', label: 'Qwen 3.5 397B', contextWindow: 131072 },
  'moonshotai/kimi-k2.5':            { input: 0.41, output: 2.06, tier: 'mid', label: 'Kimi K2.5', contextWindow: 131072 },
  'deepseek/deepseek-r1':            { input: 0.55, output: 2.19, tier: 'mid', label: 'DeepSeek R1', contextWindow: 65536 },
  'z-ai/glm-5':                      { input: 0.60, output: 1.90, tier: 'mid', label: 'GLM 5', contextWindow: 128000 },
  'writer/palmyra-x5':               { input: 0.60, output: 6.00, tier: 'mid', label: 'Palmyra X5', contextWindow: 128000 },
  'qwen/qwen3-max-thinking':         { input: 0.78, output: 3.90, tier: 'mid', label: 'Qwen 3 Max Thinking', contextWindow: 131072 },
  'openai/gpt-5.3-codex':            { input: 1.75, output: 14.0, tier: 'mid', label: 'GPT-5.3 Codex', contextWindow: 128000 },
  'openai/gpt-5.3-chat':             { input: 1.75, output: 14.0, tier: 'mid', label: 'GPT-5.3 Chat', contextWindow: 128000 },
  'google/gemini-3.1-pro-preview':   { input: 2.00, output: 12.0, tier: 'mid', label: 'Gemini 3.1 Pro', contextWindow: 1048576 },
  'openai/gpt-5.4':                  { input: 2.50, output: 15.0, tier: 'mid', label: 'GPT-5.4', contextWindow: 128000 },
  'anthropic/claude-sonnet-4.6':     { input: 3.00, output: 15.0, tier: 'mid', label: 'Claude Sonnet 4.6', contextWindow: 200000 },

  // === PREMIUM TIER (Maestro) ===
  // Best models, used only when necessary
  'anthropic/claude-opus-4.6':       { input: 5.00, output: 25.0, tier: 'premium', label: 'Claude Opus 4.6', contextWindow: 200000 },
  'openai/gpt-5.4-pro':              { input: 30.0, output: 180.0, tier: 'premium', label: 'GPT-5.4 Pro', contextWindow: 128000 },
}

export function getDefaultModels() {
  return Object.entries(MODEL_CREDIT_RATES).map(([id, info]) => ({
    id,
    ...info,
  }))
}

export function getModelContextWindow(modelId: string): number {
  return MODEL_CREDIT_RATES[modelId]?.contextWindow || 32768 // safe default
}

export function calculateCredits(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = MODEL_CREDIT_RATES[modelId]
  if (!rates) {
    // fallback: assume mid-tier pricing
    return (inputTokens / 1000) * 2.0 + (outputTokens / 1000) * 8.0
  }
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output
}

export async function deductCredits(
  userId: string,
  amount: number,
  description: string
): Promise<boolean> {
  // Atomic deduction: allow going negative ONCE (grace), then block.
  // Uses raw SQL to avoid TOCTOU race condition.
  const result = await prisma.$executeRaw`
    UPDATE "User"
    SET "creditsBalance" = "creditsBalance" - ${amount}, "updatedAt" = NOW()
    WHERE id = ${userId} AND "creditsBalance" > -1
  `

  if (result === 0) return false // user not found or already negative (blocked)

  await prisma.creditTransaction.create({
    data: {
      userId,
      amount: -amount,
      type: 'usage',
      description,
    },
  })

  return true
}

export async function addCredits(
  userId: string,
  amount: number,
  type: 'allocation' | 'bonus' | 'reset',
  description: string
) {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { creditsBalance: { increment: amount } },
    }),
    prisma.creditTransaction.create({
      data: { userId, amount, type, description },
    }),
  ])
}

export async function hasEnoughCredits(userId: string, estimatedCost: number): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return false
  return user.creditsBalance >= estimatedCost
}
