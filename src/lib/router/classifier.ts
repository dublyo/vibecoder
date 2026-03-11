import type { TaskType } from './models'

// Rule-based intent classifier (Tier 1 — free, instant)
// Multi-language support: English + Arabic, Spanish, French, German, Portuguese,
// Chinese, Japanese, Korean, Hindi, Turkish, Russian

// ─── Greetings (multi-language) ───
// English greetings use \b word boundary; non-Latin scripts match exactly (no \b needed)
const GREETING_EN = /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|bye|goodbye|good morning|good night|gm|gn|yes|no|sure|got it|alright)\b/i
const GREETING_INTL = new RegExp(
  '^(' +
  // Arabic
  'مرحبا|اهلا|السلام عليكم|شكرا|مع السلامة|صباح الخير|مساء الخير|نعم|لا|تمام|حسنا|اهلين|يعطيك العافية' +
  // Spanish
  '|hola|buenos días|buenas tardes|buenas noches|gracias|adiós|sí|claro|vale|genial|de nada|hasta luego' +
  // French
  '|bonjour|bonsoir|salut|merci|au revoir|oui|non|d\'accord|coucou|bonne nuit' +
  // German
  '|hallo|guten morgen|guten tag|guten abend|danke|tschüss|ja|nein|alles klar' +
  // Portuguese
  '|olá|oi|bom dia|boa tarde|boa noite|obrigado|obrigada|tchau|sim|não|valeu' +
  // Turkish
  '|merhaba|selam|günaydın|iyi akşamlar|teşekkürler|hoşça kal|evet|hayır|tamam' +
  // Russian
  '|привет|здравствуйте|спасибо|пока|да|нет|хорошо|ладно|доброе утро|добрый вечер' +
  // Hindi
  '|नमस्ते|धन्यवाद|शुक्रिया|हां|नहीं|ठीक है|अलविदा' +
  // Chinese
  '|你好|谢谢|再见|早上好|晚上好|好的|是的|不是|没问题' +
  // Japanese
  '|こんにちは|こんばんは|おはよう|ありがとう|さようなら|はい|いいえ|おはようございます' +
  // Korean
  '|안녕하세요|감사합니다|네|아니요|좋아요|안녕' +
  ')\\s*$',
  'i'
)
function isGreeting(text: string): boolean {
  return GREETING_EN.test(text) || GREETING_INTL.test(text)
}

// ─── Simple factual questions (multi-language) ───
// Uses ^ anchor — all alternatives must start at beginning of string
const SIMPLE_QUESTION = new RegExp(
  '^(?:' +
  // English
  'what is |what are |who is |who are |where is |when did |when was |how many |how old |how long |how far |how tall |is there |are there |can you |do you |does |did |will |would |could |should |which |what\'s |who\'s |where\'s ' +
  // Arabic
  '|ما هو |ما هي |من هو |من هي |أين |متى |كم |هل |ما معنى |ايش |وش |كيف |ليش |شو ' +
  // Spanish
  '|qué es |quién es |dónde está |cuándo |cuántos |cuántas |cómo se |hay |puede ' +
  // French
  '|qu\'est-ce que |qui est |où est |quand |combien |est-ce que |c\'est quoi ' +
  // German
  '|was ist |wer ist |wo ist |wann |wie viele |gibt es |kannst du ' +
  // Portuguese
  '|o que é |quem é |onde fica |quando |quantos |quantas ' +
  // Turkish
  '|ne dir |kim dir |nerede |ne zaman |kaç tane ' +
  // Russian
  '|что такое |кто такой |где |когда |сколько ' +
  // Chinese
  '|什么是|谁是|哪里|什么时候|多少' +
  ')',
  'i'
)

// ─── Code patterns (mostly universal — programming keywords are English) ───
const CODE_PATTERNS = /\b(code|function|class|import|export|const|let|var|def |return |async |await |console\.|print\(|for\s*\(|while\s*\(|if\s*\(|html|css|javascript|typescript|python|rust|java|sql|api|endpoint|bug|error|debug|fix|refactor|component|hook|middleware|database|query|schema|deploy|docker|git|npm|pip|cargo|react|vue|angular|node|express|flask|django)\b/i

// ─── Math patterns (multi-language) ───
const MATH_PATTERNS = new RegExp(
  '\\b(calculate|solve|equation|integral|derivative|probability|statistics|algebra|geometry|matrix|vector|formula|proof|theorem|math|factorial|logarithm|trigonometry|calculus' +
  // Spanish/French/Portuguese (Latin script — \b works)
  '|calcular|resolver|ecuación|probabilidad|estadística|álgebra|geometría|fórmula' +
  '|calculer|résoudre|équation|probabilité|statistique|algèbre|formule' +
  ')\\b' +
  // Arabic (no \b needed — different script boundary)
  '|احسب|حل المعادلة|معادلة|احتمال|إحصاء|جبر|هندسة|مصفوفة|مشتقة|تكامل|رياضيات' +
  // Russian
  '|вычислить|решить|уравнение|вероятность|статистика|алгебра|геометрия|формула|математика',
  'i'
)

// ─── Writing patterns (multi-language) ───
const WRITING_PATTERNS = new RegExp(
  '\\b(write|essay|story|poem|blog|article|email|letter|copy|headline|tagline|slogan|creative|fiction|narrative|describe|rewrite|rephrase|translate|draft' +
  // Spanish/French (Latin script)
  '|escribir|escriba|ensayo|cuento|poema|artículo|correo|carta|redactar|traducir|describir' +
  '|écrire|écris|essai|histoire|poème|courriel|lettre|rédiger|traduire|décrire' +
  ')\\b' +
  // Arabic
  '|اكتب|مقال|قصة|قصيدة|رسالة|بريد|إيميل|صياغة|أعد كتابة|ترجم|وصف|سيرة ذاتية' +
  // Russian
  '|написать|напиши|эссе|рассказ|стихотворение|статья|письмо|перевести|описать',
  'i'
)

// ─── Analysis patterns (multi-language) ───
const ANALYSIS_PATTERNS = new RegExp(
  '\\b(analyze|compare|evaluate|assess|explain why|explain how|explain the|explain .+ (?:between|vs|versus)|how does .+ work|research|study|investigate|breakdown|pros and cons|advantage|disadvantage|trade-?offs?|impact of|implications|contrast|differences? between|similarities|use cases|risks?|mitigat|based on .+(?:what|how|why)|strengths? and weakness|swot|biggest .+(?:challenge|risk|threat|issue|problem)|recommend|suggest .+ approach|summarize' +
  // Spanish/French (Latin script)
  '|analizar|comparar|evaluar|explicar|investigar|ventajas y desventajas|impacto|riesgos|recomendar|resumir' +
  '|analyser|comparer|évaluer|expliquer|rechercher|avantages et inconvénients|recommander|résumer' +
  ')\\b' +
  // Arabic
  '|حلل|قارن|قيم|اشرح|لماذا|كيف يعمل|بحث|دراسة|إيجابيات وسلبيات|مزايا|عيوب|تأثير|مخاطر|أوصي|اقترح|لخص|ما الفرق' +
  // Russian
  '|анализировать|сравнить|оценить|объяснить|исследовать|преимущества и недостатки|риски|рекомендовать|резюмировать',
  'i'
)

// ─── Complex patterns (multi-language) ───
const COMPLEX_PATTERNS = new RegExp(
  '\\b(step by step|detailed|comprehensive|in-depth|thorough|complete|full|design|architect|plan|strategy|framework|system|build me|create a full|implement|from scratch' +
  // Spanish/French (Latin script)
  '|paso a paso|detallado|completo|exhaustivo|diseñar|arquitectura|estrategia|implementar|desde cero' +
  '|étape par étape|détaillé|approfondi|concevoir|architecture|stratégie|système|implémenter|à partir de zéro' +
  ')\\b' +
  // Arabic
  '|خطوة بخطوة|تفصيلي|شامل|معمق|كامل|صمم|خطة|استراتيجية|نظام|ابني|من الصفر' +
  // Russian
  '|пошагово|подробный|полный|детальный|спроектировать|архитектура|стратегия|система|реализовать|с нуля',
  'i'
)

export interface ClassificationResult {
  taskType: TaskType
  complexity: 'simple' | 'medium' | 'complex'
  confidence: number
}

export function classifyMessage(message: string): ClassificationResult {
  const trimmed = message.trim()

  // Very short messages are simple
  if (trimmed.length < 15 || isGreeting(trimmed)) {
    return { taskType: 'quick_chat', complexity: 'simple', confidence: 0.95 }
  }

  // Simple factual questions — keep cheap even if they contain analysis words
  if (SIMPLE_QUESTION.test(trimmed) && trimmed.length < 80 && !COMPLEX_PATTERNS.test(trimmed)) {
    return { taskType: 'quick_chat', complexity: 'simple', confidence: 0.85 }
  }

  // Check for code-related content
  if (CODE_PATTERNS.test(trimmed)) {
    const isComplex = COMPLEX_PATTERNS.test(trimmed) || trimmed.length > 500
    return {
      taskType: 'coding',
      complexity: isComplex ? 'complex' : 'medium',
      confidence: 0.8,
    }
  }

  // Check for math
  if (MATH_PATTERNS.test(trimmed)) {
    const isComplex = COMPLEX_PATTERNS.test(trimmed) || trimmed.length > 200
    return {
      taskType: 'math_reasoning',
      complexity: isComplex ? 'complex' : 'medium',
      confidence: 0.8,
    }
  }

  // Check for writing tasks
  if (WRITING_PATTERNS.test(trimmed)) {
    const isComplex = COMPLEX_PATTERNS.test(trimmed) || trimmed.length > 200
    return {
      taskType: 'creative_writing',
      complexity: isComplex ? 'complex' : 'medium',
      confidence: 0.75,
    }
  }

  // Check for analysis
  if (ANALYSIS_PATTERNS.test(trimmed)) {
    const isComplex = COMPLEX_PATTERNS.test(trimmed) || trimmed.length > 300
    return {
      taskType: 'analysis',
      complexity: isComplex ? 'complex' : 'medium',
      confidence: 0.7,
    }
  }

  // Check for complex tasks
  if (COMPLEX_PATTERNS.test(trimmed)) {
    return {
      taskType: 'complex',
      complexity: 'complex',
      confidence: 0.65,
    }
  }

  // Default: quick chat for short, analysis for long
  if (trimmed.length > 200) {
    return { taskType: 'analysis', complexity: 'medium', confidence: 0.5 }
  }

  return { taskType: 'quick_chat', complexity: 'simple', confidence: 0.6 }
}
