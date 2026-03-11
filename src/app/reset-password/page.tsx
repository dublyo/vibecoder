'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, AlertCircle, CheckCircle } from '@/components/icons'
import { Suspense } from 'react'

function ResetForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!token) {
      setError('Invalid reset link. Please request a new one.')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (!token) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-gray-900 dark:text-white font-medium mb-2">Invalid Reset Link</p>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
          This password reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" className="text-brand-600 hover:text-brand-700 text-sm font-medium">
          Request a new reset link
        </Link>
      </div>
    )
  }

  return success ? (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 text-center">
      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
      <p className="text-gray-900 dark:text-white font-medium mb-2">Password Reset!</p>
      <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
        Your password has been changed successfully.
      </p>
      <Link href="/login" className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 px-6 rounded-xl transition">
        Sign In
      </Link>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
        <input
          type="password" required value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="Minimum 8 characters"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm Password</label>
        <input
          type="password" required value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="Re-enter your password"
        />
      </div>
      <button
        type="submit" disabled={loading}
        className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Resetting...' : 'Reset Password'}
      </button>
      {error && (
        <div className="flex items-center gap-2 text-red-500 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="VibeCoder" className="w-16 h-16 mx-auto mb-4 rounded-2xl" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">New Password</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Choose a new password for your account</p>
        </div>
        <Suspense fallback={<div className="text-center text-gray-500">Loading...</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  )
}
