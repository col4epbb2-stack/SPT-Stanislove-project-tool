interface BadgeProps {
  label: string
  bg: string
  text: string
  dot?: string
}

export function Badge({ label, bg, text, dot }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${bg} ${text}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      {label}
    </span>
  )
}
