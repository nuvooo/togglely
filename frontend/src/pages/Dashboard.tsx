import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOrganizationStore } from '@/store/organizationStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Building2, 
  FolderKanban, 
  Flag, 
  Plus, 
  ArrowRight,
  Clock,
  TrendingUp,
  Users
} from 'lucide-react';

export default function Dashboard() {
  const { t } = useTranslation();
  const { organizations, stats, fetchOrganizations, isLoading } = useOrganizationStore();

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('dashboard.welcome')}
          </p>
        </div>
        <Button asChild>
          <Link to="/organizations/new">
            <Plus className="w-4 h-4 mr-2" />
            {t('dashboard.new-organization')}
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.stats.organizations')}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalOrganizations ?? organizations.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">{t('dashboard.stats.organizations-description')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.stats.projects')}</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalProjects ?? 0}</div>
            <p className="text-xs text-muted-foreground">{t('dashboard.stats.projects-description')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.stats.feature-flags')}</CardTitle>
            <Flag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalFlags ?? 0}</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {t('dashboard.stats.feature-flags-enabled', { count: stats?.totalEnabledFlags ?? 0 })}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.stats.activity')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">{t('dashboard.stats.activity-description')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Organizations Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">{t('dashboard.organizations.title')}</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/organizations">
              {t('dashboard.organizations.view-all')}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 w-32 bg-muted rounded" />
                  <div className="h-4 w-24 bg-muted rounded" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 w-full bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : organizations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Building2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{t('dashboard.organizations.no-organizations')}</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
                {t('dashboard.organizations.create-first')}
              </p>
              <Button asChild>
                <Link to="/organizations/new">
                  <Plus className="w-4 h-4 mr-2" />
                  {t('dashboard.organizations.create-cta')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {organizations.slice(0, 6).map((org) => (
              <Card key={org.id} className="group hover:shadow-lg transition-all cursor-pointer">
                <Link to={`/organizations/${org.id}`} className="block">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-lg">
                          {org.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <CardTitle className="text-lg group-hover:text-primary transition-colors">
                            {org.name}
                          </CardTitle>
                          <CardDescription>{org.slug}</CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <FolderKanban className="w-4 h-4" />
                        <span>{t('dashboard.organizations.projects-count', { count: (org as any).projectCount ?? 0 })}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{t('dashboard.organizations.members-count', { count: (org as any).memberCount ?? 1 })}</span>
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">{t('dashboard.quick-actions.title')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <Link to="/organizations/new" className="block p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold">{t('dashboard.quick-actions.new-organization')}</h3>
                  <p className="text-sm text-muted-foreground">{t('dashboard.quick-actions.new-organization-desc')}</p>
                </div>
              </div>
            </Link>
          </Card>

          {organizations.length > 0 && (
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <Link to={`/organizations/${organizations[0].id}?action=create-project`} className="block p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <FolderKanban className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{t('dashboard.quick-actions.new-project')}</h3>
                    <p className="text-sm text-muted-foreground">{t('dashboard.quick-actions.new-project-desc', { orgName: organizations[0].name })}</p>
                  </div>
                </div>
              </Link>
            </Card>
          )}

          {organizations.length > 0 && (
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <Link to={`/organizations/${organizations[0].id}`} className="block p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                    <Flag className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{t('dashboard.quick-actions.feature-flags')}</h3>
                    <p className="text-sm text-muted-foreground">{t('dashboard.quick-actions.feature-flags-desc')}</p>
                  </div>
                </div>
              </Link>
            </Card>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-lg">{t('dashboard.activity.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('dashboard.activity.coming-soon')}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
