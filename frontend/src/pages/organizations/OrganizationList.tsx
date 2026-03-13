import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOrganizationStore } from '@/store/organizationStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Building2, 
  Plus, 
  ArrowRight, 
  Search,
  FolderKanban,
  Users,
  Settings,
  Loader2,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function OrganizationList() {
  const { t } = useTranslation();
  const { organizations, fetchOrganizations, isLoading } = useOrganizationStore();

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('organizations.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('organizations.subtitle')}
          </p>
        </div>
        <Button asChild>
          <Link to="/organizations/new">
            <Plus className="w-4 h-4 mr-2" />
            {t('organizations.new-organization')}
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('organizations.search-placeholder')}
          className="pl-10"
        />
      </div>

      {/* Organizations Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : organizations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">{t('organizations.no-organizations')}</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
              {t('organizations.no-organizations-description')}
            </p>
            <Button asChild size="lg">
              <Link to="/organizations/new">
                <Plus className="w-4 h-4 mr-2" />
                {t('organizations.create-cta')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <Card key={org.id} className="group hover:shadow-lg transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-xl shadow-lg shadow-primary/20">
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-lg truncate group-hover:text-primary transition-colors">
                        {org.name}
                      </CardTitle>
                      <CardDescription className="text-xs">{org.slug}</CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/organizations/${org.id}`}>
                          <FolderKanban className="w-4 h-4 mr-2" />
                          {t('organizations.menu.view-projects')}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to={`/organizations/${org.id}/settings`}>
                          <Settings className="w-4 h-4 mr-2" />
                          {t('organizations.menu.settings')}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">
                        {t('organizations.menu.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-1.5">
                    <FolderKanban className="w-4 h-4" />
                    <span>{t('organizations.card.projects', { count: (org as any).projectCount ?? 0 })}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    <span>{t('organizations.card.members', { count: (org as any).memberCount ?? 1 })}</span>
                  </div>
                </div>
                <Button variant="secondary" className="w-full" asChild>
                  <Link to={`/organizations/${org.id}`}>
                    {t('organizations.card.view')}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
