import type { Metadata } from 'next'
import '@/styles/globals.css'
import { ToastProvider } from '@/components/vibecoder/toast'

export const metadata: Metadata = {
  title: 'VibeCoder',
  description: 'AI Vibe Coding Platform — Build web apps with AI',
  icons: {
    icon: [
      { url: '/logo/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/logo/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    shortcut: '/logo/favicon.ico',
    apple: [
      { url: '/logo/apple-icon-180x180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/logo/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
