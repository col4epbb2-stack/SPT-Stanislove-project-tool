import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  loading?: boolean
}

const variants = {
  primary:
    'bg-primary text-white hover:bg-primary-light active:bg-primary-dark shadow-sm hover:shadow focus:ring-primary/40',
  secondary:
    'text-white shadow-sm hover:shadow focus:ring-accent/40 bg-linear-to-br from-accent to-accent-light hover:brightness-105',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 active:bg-gray-200 border border-gray-200 hover:border-gray-300 focus:ring-gray-300',
  // Action destructrice (suppression d'un compte, 20/08/2026) : le rouge est
  // réservé à ce qui ne se rattrape pas, et n'était jusqu'ici disponible que
  // par une `className` posée au cas par cas.
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm hover:shadow focus:ring-red-400/50',
}

const sizes = {
  sm: 'px-3.5 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  disabled,
  loading = false,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-1 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" aria-hidden="true" />}
      {children}
    </button>
  )
}
