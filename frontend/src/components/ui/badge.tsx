import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        /** Type/status without meaning (flag type, counts, roles). */
        neutral: 'border-transparent bg-muted text-muted-foreground',
        /** Positive status (on, delivered, running). */
        success: 'border-transparent bg-success/15 text-success',
        /** Attention (pending, paused, retrying). */
        warning: 'border-transparent bg-warning/15 text-foreground',
        /** Error / failed / danger. */
        destructive: 'border-transparent bg-destructive/15 text-destructive',
        /** Plain outlined label (e.g. environment names). */
        outline: 'text-foreground',
        /** Emphasis in the primary color (e.g. the owner role). */
        default: 'border-transparent bg-primary text-primary-foreground',
        /** @deprecated alias of `neutral`, kept for older call sites. */
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
)

export type BadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>['variant']
>

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
