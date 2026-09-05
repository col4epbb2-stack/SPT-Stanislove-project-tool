import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  variant?: 'light' | 'dark'
}

const variants = {
  light: {
    label: 'text-gray-500',
    input:
      'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300 focus:ring-primary/20 focus:border-primary focus:bg-white',
    error: 'text-red-500',
    errorDot: 'bg-red-500',
  },
  dark: {
    label: 'text-white/80',
    input: 'bg-white/10 border-white/20 text-white placeholder-white/40 focus:ring-accent/60 focus:border-accent/60',
    error: 'text-red-300',
    errorDot: 'bg-red-400',
  },
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, variant = 'light', className = '', ...props }, ref) => {
    const styles = variants[variant]
    return (
      <div className="w-full">
        {label && <label className={`block text-sm font-medium mb-1.5 ${styles.label}`}>{label}</label>}
        <input
          ref={ref}
          className={`w-full px-4 py-3 rounded-xl border text-base
            focus:outline-none focus:ring-2 transition
            disabled:opacity-50 disabled:cursor-not-allowed
            ${styles.input}
            ${error ? 'border-red-400/60' : ''}
            ${className}`}
          {...props}
        />
        {error && (
          <p className={`mt-1.5 text-xs flex items-center gap-1 ${styles.error}`}>
            <span className={`w-1 h-1 rounded-full shrink-0 ${styles.errorDot}`} />
            {error}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
