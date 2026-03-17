import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOrganizationStore } from '@/store/organizationStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  Building2, 
  Loader2,
  CheckCircle2,
  Globe,
  Sparkles
} from 'lucide-react';

export default function CreateOrganization() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { createOrganization } = useOrganizationStore();

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const org = await createOrganization({ name, slug });
      navigate(`/organizations/${org.id}`);
    } catch (err: any) {
      const message = err.response?.data?.message;
      const errorCode = err.response?.data?.error;
      
      if (err.response?.status === 409 || errorCode === 'Conflict') {
        // Generate a unique slug suggestion
        const randomSuffix = Math.floor(Math.random() * 10000);
        const suggestedSlug = `${slug}-${randomSuffix}`;
        setError(`Organization name already exists. Try "${suggestedSlug}" instead.`);
        setSlug(suggestedSlug);
      } else {
        setError(message || errorCode || 'Failed to create organization');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/organizations" className="hover:text-foreground transition-colors">
          {t('organization-detail.breadcrumb.organizations')}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{t('create-organization.title')}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link to="/organizations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('create-organization.title')}</h1>
          <p className="text-muted-foreground">{t('create-organization.subtitle')}</p>
        </div>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>{t('create-organization.details.title')}</CardTitle>
              <CardDescription>{t('create-organization.details.description')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">{t('create-organization.name-label')}</Label>
              <Input
                id="name"
                placeholder={t('create-organization.name-placeholder')}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                {t('create-organization.name-help')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">{t('create-organization.slug-label')}</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="slug"
                  placeholder={t('create-organization.slug-placeholder')}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  required
                  className="h-11 pl-10 font-mono"
                  pattern="[a-z0-9-]+"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('create-organization.slug-help')}
              </p>
            </div>

            {/* Preview */}
            {name && (
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm font-medium mb-2">{t('create-organization.preview.title')}</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{t('create-organization.preview.url', { slug })}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 pt-2">
              <Button 
                type="submit" 
                className="min-w-[140px]"
                disabled={isLoading || !name || !slug}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('create-organization.creating')}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t('create-organization.submit')}
                  </>
                )}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/organizations">{t('common.cancel')}</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tips */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-muted/50 border-0">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium text-sm">{t('create-organization.tips.what-next.title')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('create-organization.tips.what-next.description')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-0">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium text-sm">{t('create-organization.tips.best-practices.title')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('create-organization.tips.best-practices.description')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
