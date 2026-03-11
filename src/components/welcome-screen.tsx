'use client'

interface WelcomeScreenProps {
  onSuggestion: (text: string) => void
}

const suggestions = [
  { title: 'Explain quantum computing', subtitle: 'In simple terms' },
  { title: 'Write a Python function', subtitle: 'For data processing' },
  { title: 'Help me brainstorm ideas', subtitle: 'For a new project' },
  { title: 'Review my code', subtitle: 'Find bugs and improvements' },
]

export function WelcomeScreen({ onSuggestion }: WelcomeScreenProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center">
        <img src="/logo.png" alt="VibeCoder" className="w-16 h-16 mx-auto mb-6 rounded-2xl" />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Start a New Chat
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          ChatGPT quality at 10x lower cost. Smart routing picks the best model for each message.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {suggestions.map((s) => (
            <button
              key={s.title}
              onClick={() => onSuggestion(s.title)}
              className="p-4 text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-brand-300 hover:shadow-md transition"
            >
              <p className="font-medium text-gray-900 dark:text-white mb-1">{s.title}</p>
              <p className="text-sm text-gray-500">{s.subtitle}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
