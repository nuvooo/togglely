import { Check, Copy } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Monospace code sample with a copy button; `label` names the figure for assistive tech. */
export function CodeBlock({ code, label, className }: { code: string; label: string; className?: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const captionId = useId()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('invites.copy-failed'))
    }
  }

  return (
    <figure aria-labelledby={captionId} className={cn('relative m-0 rounded-md border bg-muted/40', className)}>
      <figcaption id={captionId} className="sr-only">{label}</figcaption>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copy}
        aria-label={t('webhooks.copy-code', { label })}
        className="absolute right-1.5 top-1.5 h-7 px-2 text-xs text-muted-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <pre className="overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </figure>
  )
}
