import { cn } from '@/lib/utils'

/**
 * Togglely smiley: two toggles (off, on) as eyes and a smile.
 * The dark parts use `currentColor`, so the logo stays visible in dark mode.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 144 112"
      className={cn('text-foreground', className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="13" y="24" width="54" height="24" rx="12" fill="currentColor" />
      <circle cx="26" cy="36" r="8" className="fill-background" />
      <rect x="75" y="24" width="54" height="24" rx="12" fill="#00C94F" />
      <circle cx="116" cy="36" r="8" fill="#FFFFFF" />
      <path
        d="M 42 75 Q 71 106 100 75"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
    </svg>
  )
}
