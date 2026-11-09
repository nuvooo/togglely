import { Check, Copy } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Read-only link with a copy button; falls back to selecting the text. */
export function CopyLinkField({ id, label, value }: { id: string; label: string; value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // Clipboard API unavailable (e.g. plain http): let the user copy by hand
      ref.current?.select()
      toast.error(t('invites.copy-failed'))
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          ref={ref}
          value={value}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 font-mono text-xs"
        />
        <Button type="button" variant="outline" onClick={copy} className="shrink-0">
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          {copied ? t('invites.copied') : t('invites.copy')}
        </Button>
      </div>
    </div>
  )
}
