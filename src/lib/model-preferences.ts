import { prisma } from './db'
import { MODEL_CREDIT_RATES } from './credits'
import { TIER_MODELS, MODEL_SPECIALIZATIONS, type TaskType } from './router/models'

const SETTINGS_KEY = 'model_preferences'

// In-memory cache to avoid DB hit on every message
let _cachedPrefs: ModelPreferences | null = null
let _cachedAt = 0
const CACHE_TTL_MS = 60_000 // 1 minute

export interface ModelPreferences {
  maestroModel: string // the premium "oversight" model
  preferredModels: {
    cheap: string[]  // user's preferred cheap models (ordered by preference)
    mid: string[]    // user's preferred mid models
    premium: string[] // user's preferred premium models
  }
  disabledModels: string[] // models the user has disabled
}

const DEFAULT_PREFERENCES: ModelPreferences = {
  maestroModel: 'anthropic/claude-opus-4.6',
  preferredModels: {
    cheap: [],  // empty = use system defaults
    mid: [],
    premium: [],
  },
  disabledModels: [],
}

export async function getModelPreferences(): Promise<ModelPreferences> {
  // Return cached if fresh
  if (_cachedPrefs && Date.now() - _cachedAt < CACHE_TTL_MS) {
    return _cachedPrefs
  }

  const setting = await prisma.settings.findUnique({
    where: { key: SETTINGS_KEY },
  })
  let prefs: ModelPreferences
  if (!setting) {
    prefs = DEFAULT_PREFERENCES
  } else {
    try {
      prefs = { ...DEFAULT_PREFERENCES, ...JSON.parse(setting.value) }
    } catch {
      prefs = DEFAULT_PREFERENCES
    }
  }

  _cachedPrefs = prefs
  _cachedAt = Date.now()
  return prefs
}

export async function setModelPreferences(prefs: Partial<ModelPreferences>): Promise<ModelPreferences> {
  const current = await getModelPreferences()
  const updated = { ...current, ...prefs }

  // Validate maestro model exists and is premium
  if (updated.maestroModel && !MODEL_CREDIT_RATES[updated.maestroModel]) {
    throw new Error(`Unknown model: ${updated.maestroModel}`)
  }

  await prisma.settings.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(updated) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(updated) },
  })

  // Invalidate cache
  _cachedPrefs = updated
  _cachedAt = Date.now()

  return updated
}

// Get the effective model for a task+tier, respecting user preferences
export function getPreferredModel(
  taskType: TaskType,
  tier: 'cheap' | 'mid' | 'premium',
  prefs: ModelPreferences,
): string {
  // For premium tier, always use the maestro model
  if (tier === 'premium') {
    return prefs.maestroModel
  }

  const userPreferred = prefs.preferredModels[tier]
  const disabled = new Set(prefs.disabledModels)

  // If user has preferred models for this tier, try those first
  if (userPreferred.length > 0) {
    const validPref = userPreferred.find(m =>
      !disabled.has(m) &&
      TIER_MODELS[tier].includes(m) &&
      MODEL_CREDIT_RATES[m]
    )
    if (validPref) return validPref
  }

  // Fall back to system specialization, skipping disabled models
  const specialized = MODEL_SPECIALIZATIONS[taskType]
  const tierModels = TIER_MODELS[tier]
  const match = specialized.find(m => tierModels.includes(m) && !disabled.has(m))
  if (match) return match

  // Last resort: first non-disabled model in tier
  return tierModels.find(m => !disabled.has(m)) || tierModels[0]
}

// Get all available models grouped by tier
export function getAvailableModels() {
  return Object.entries(MODEL_CREDIT_RATES).map(([id, config]) => ({
    id,
    label: config.label,
    tier: config.tier,
    contextWindow: config.contextWindow,
    inputCost: config.input,
    outputCost: config.output,
  }))
}
