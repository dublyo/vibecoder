'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2 } from './icons'

interface ChatInputProps {
  onSend: (message: string) => void
  isLoading: boolean
  disabled?: boolean
  borderless?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, isLoading, disabled, borderless, placeholder }: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  useEffect(() => { autoResize() }, [input])

  const handleSend = () => {
    if (!input.trim() || isLoading || disabled) return
    onSend(input.trim())
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={borderless ? 'px-4' : 'px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}>
      <div className="max-w-3xl mx-auto">
        <div className={`relative rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm focus-within:shadow-md focus-within:border-gray-300 dark:focus-within:border-gray-600 transition-shadow ${borderless ? 'shadow-md border-gray-200/80' : ''}`}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="w-full px-5 pt-4 pb-12 bg-transparent resize-none outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 text-[15px]"
            placeholder={placeholder || "Message VibeCoder..."}
            disabled={disabled}
          />
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || disabled}
              className="p-2 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white dark:text-gray-900 disabled:text-gray-400 dark:disabled:text-gray-500 rounded-xl transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
