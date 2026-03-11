import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST,
  port: Number(process.env.EMAIL_SMTP_PORT) || 587,
  secure: process.env.EMAIL_SMTP_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_SMTP_USER,
    pass: process.env.EMAIL_SMTP_PASSWORD,
  },
})

const FROM = process.env.EMAIL_FROM || 'noreply@vibecode.new'
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'VibeCoder'

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.DOMAIN) return `https://${process.env.DOMAIN}`
  return 'http://localhost:3000'
}

export function isEmailConfigured(): boolean {
  return !!(process.env.EMAIL_SMTP_HOST && process.env.EMAIL_SMTP_USER && process.env.EMAIL_SMTP_PASSWORD)
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!isEmailConfigured()) {
    console.warn('[email] SMTP not configured, skipping email to', to)
    return false
  }
  try {
    await transporter.sendMail({
      from: `${APP_NAME} <${FROM}>`,
      to,
      subject,
      html,
    })
    console.log('[email] Sent to', to, ':', subject)
    return true
  } catch (err) {
    console.error('[email] Failed to send to', to, err)
    return false
  }
}

// --- Email Templates ---

export async function sendWelcomeInvite(to: string, name: string, tempPassword: string) {
  const loginUrl = `${getBaseUrl()}/login`
  return sendEmail(to, `You've been invited to ${APP_NAME}`, `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1a1a2e; margin-bottom: 8px;">Welcome to ${APP_NAME}!</h2>
      <p style="color: #444; line-height: 1.6;">Hi <strong>${name}</strong>,</p>
      <p style="color: #444; line-height: 1.6;">You've been invited to join ${APP_NAME}. Here are your login credentials:</p>
      <div style="background: #f4f4f8; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0; color: #333;"><strong>Email:</strong> ${to}</p>
        <p style="margin: 4px 0; color: #333;"><strong>Password:</strong> ${tempPassword}</p>
      </div>
      <p style="color: #444; line-height: 1.6;">Please change your password after your first login.</p>
      <a href="${loginUrl}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 8px;">Sign In</a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn't expect this invite, you can ignore this email.</p>
    </div>
  `)
}

export async function sendPasswordResetEmail(to: string, name: string, resetToken: string) {
  const resetUrl = `${getBaseUrl()}/reset-password?token=${resetToken}`
  return sendEmail(to, `Reset your ${APP_NAME} password`, `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1a1a2e; margin-bottom: 8px;">Password Reset</h2>
      <p style="color: #444; line-height: 1.6;">Hi <strong>${name}</strong>,</p>
      <p style="color: #444; line-height: 1.6;">We received a request to reset your password. Click the button below to choose a new password:</p>
      <a href="${resetUrl}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Reset Password</a>
      <p style="color: #444; line-height: 1.6;">This link expires in <strong>1 hour</strong>.</p>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
    </div>
  `)
}

export async function sendPasswordChangedEmail(to: string, name: string) {
  return sendEmail(to, `Your ${APP_NAME} password was changed`, `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1a1a2e; margin-bottom: 8px;">Password Changed</h2>
      <p style="color: #444; line-height: 1.6;">Hi <strong>${name}</strong>,</p>
      <p style="color: #444; line-height: 1.6;">Your password has been successfully changed. If you did not make this change, please contact your administrator immediately.</p>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">— ${APP_NAME}</p>
    </div>
  `)
}

export async function sendSharedConversation(
  to: string,
  sharedByName: string,
  conversationTitle: string,
  messages: { role: string; content: string; modelUsed?: string | null }[]
) {
  const messagesHtml = messages
    .map(m => {
      const isUser = m.role === 'user'
      const label = isUser ? 'You' : (m.modelUsed || 'Assistant')
      const bg = isUser ? '#e8e5ff' : '#f4f4f8'
      const content = m.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
      return `
        <div style="background: ${bg}; border-radius: 8px; padding: 12px 16px; margin: 8px 0;">
          <p style="margin: 0 0 4px; font-weight: 600; font-size: 12px; color: #666;">${label}</p>
          <p style="margin: 0; color: #333; line-height: 1.6; white-space: pre-wrap;">${content}</p>
        </div>`
    })
    .join('')

  const loginUrl = `${getBaseUrl()}/login`
  return sendEmail(to, `${sharedByName} shared a conversation: ${conversationTitle}`, `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1a1a2e; margin-bottom: 8px;">Shared Conversation</h2>
      <p style="color: #444; line-height: 1.6;"><strong>${sharedByName}</strong> shared a chat conversation with you from ${APP_NAME}.</p>
      <h3 style="color: #1a1a2e; margin: 24px 0 8px;">${conversationTitle}</h3>
      <p style="color: #888; font-size: 13px; margin-bottom: 16px;">${messages.length} messages</p>
      ${messagesHtml}
      <div style="margin-top: 24px;">
        <a href="${loginUrl}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open ${APP_NAME}</a>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">Shared at ${new Date().toISOString()}</p>
    </div>
  `)
}

export async function sendTestEmail(to: string) {
  return sendEmail(to, `${APP_NAME} - Test Email`, `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1a1a2e; margin-bottom: 8px;">Email Configuration Working!</h2>
      <p style="color: #444; line-height: 1.6;">This is a test email from <strong>${APP_NAME}</strong>.</p>
      <p style="color: #444; line-height: 1.6;">If you're reading this, your SMTP configuration is correct.</p>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">Sent at ${new Date().toISOString()}</p>
    </div>
  `)
}
