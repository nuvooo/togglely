import { ArrowRight, Radio } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CopyLinkField } from '@/components/members/CopyLinkField'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { projectPath } from '@/lib/routes'
import {
  etagSnippet,
  eventSourceSnippet,
  type ProjectEnvironment,
  sdkOrigin,
  streamUrl,
} from '@/lib/webhooks'
import { CodeBlock } from './CodeBlock'

interface IntegrationCardProps {
  projectId: string
  projectKey: string
  environments: ProjectEnvironment[]
}

/** How applications learn about flag changes: live stream, ETag polling, webhooks. */
export function IntegrationCard({ projectId, projectKey, environments }: IntegrationCardProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string>('')
  const envKey = (environments.find((e) => e.key === selected) ?? environments[0])?.key ?? '<environment>'
  const origin = sdkOrigin()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Radio className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>{t('integration.title')}</CardTitle>
            <CardDescription>{t('integration.description')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {environments.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="integration-env">{t('integration.environment')}</Label>
            <Select value={envKey} onValueChange={setSelected}>
              <SelectTrigger id="integration-env" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.key}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <CopyLinkField id="integration-stream-url" label={t('integration.stream-url')} value={streamUrl(origin, projectKey, envKey)} />

        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t('integration.stream-title')}</h3>
          <p className="text-sm text-muted-foreground">{t('integration.stream-text')}</p>
          <CodeBlock code={eventSourceSnippet(origin, projectKey, envKey)} label={t('integration.stream-title')} />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t('integration.etag-title')}</h3>
          <p className="text-sm text-muted-foreground">{t('integration.etag-text')}</p>
          <CodeBlock code={etagSnippet(origin, projectKey, envKey)} label={t('integration.etag-title')} />
        </div>

        <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t('integration.webhooks-text')}</p>
          <Link
            to={projectPath(projectId, 'webhooks')}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t('integration.webhooks-link')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
