import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOrganizationStore } from '@/store/organizationStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Building2, 
  Plus, 
  ArrowLeft, 
  Search,
  FolderKanban,
  Settings,
  Loader2,
  MoreVertical,
  Trash2,
  Users,
  Globe
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function OrganizationDetail() {
  const { t } = useTranslation();
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { 
    currentOrganization, 
    fetchOrganizationById, 
    deleteOrganization,
    createProject,
    deleteProject,
    isLoading 
  } = useOrganizationStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCreateProjectDialog, setShowCreateProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectKey, setNewProjectKey] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  useEffect(() => {
    if (orgId) {
      fetchOrganizationById(orgId);
    }
    // Check if we should open create project dialog (from dashboard quick action)
    if (searchParams.get('action') === 'create-project') {
      setShowCreateProjectDialog(true);
    }
  }, [orgId, fetchOrganizationById, searchParams]);

  const generateKey = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleNameChange = (value: string) => {
    setNewProjectName(value);
    if (!newProjectKey || newProjectKey === generateKey(newProjectName)) {
      setNewProjectKey(generateKey(value));
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setIsCreatingProject(true);
    try {
      await createProject(orgId, { name: newProjectName, key: newProjectKey });
      setShowCreateProjectDialog(false);
      setNewProjectName('');
      setNewProjectKey('');
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    setIsDeletingProject(true);
    try {
      await deleteProject(projectToDelete);
      setProjectToDelete(null);
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setIsDeletingProject(false);
    }
  };

  const handleDelete = async () => {
    if (!orgId) return;
    try {
      await deleteOrganization(orgId);
      navigate('/organizations');
    } catch (error) {
      console.error('Failed to delete organization:', error);
    }
  };

  const projects = currentOrganization?.projects || [];
  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading || !currentOrganization) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/organizations" className="hover:text-foreground transition-colors">
          {t('organization-detail.breadcrumb.organizations')}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{currentOrganization.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link to="/organizations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-xl shadow-lg shadow-primary/20">
              {currentOrganization.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{currentOrganization.name}</h1>
              <p className="text-muted-foreground text-sm">{currentOrganization.slug}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to={`/organizations/${orgId}/settings`}>
              <Settings className="w-4 h-4 mr-2" />
              {t('organizations.menu.settings')}
            </Link>
          </Button>
          <Dialog open={showCreateProjectDialog} onOpenChange={setShowCreateProjectDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                {t('organization-detail.projects.create-cta')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>
                  Add a new project to {currentOrganization.name}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateProject}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="projectName">Project Name</Label>
                    <Input
                      id="projectName"
                      placeholder="My Project"
                      value={newProjectName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="projectKey">Project Key</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="projectKey"
                        placeholder="my-project"
                        value={newProjectKey}
                        onChange={(e) => setNewProjectKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        required
                        className="pl-10 font-mono"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowCreateProjectDialog(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={isCreatingProject || !newProjectName || !newProjectKey}>
                    {isCreatingProject ? t('common.loading') : t('common.create')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('organization-detail.stats.projects')}</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('organization-detail.stats.members')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(currentOrganization as any).members?.length ?? 1}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('organization-detail.stats.created')}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Date(currentOrganization.createdAt).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">{t('organization-detail.projects.title')}</h2>
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('organization-detail.projects.search-placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FolderKanban className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{t('organization-detail.projects.no-projects')}</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                {t('organization-detail.projects.create-first')}
              </p>
              <Button size="lg" onClick={() => setShowCreateProjectDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('organization-detail.projects.create-cta')}
              </Button>
            </CardContent>
          </Card>
        ) : filteredProjects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">{t('organization-detail.projects.no-results')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <Card key={project.id} className="group hover:shadow-lg transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white font-bold">
                        {project.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate group-hover:text-primary transition-colors">
                          {project.name}
                        </CardTitle>
                        <CardDescription className="text-xs">{project.key}</CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/projects/${project.id}?orgId=${orgId}`}>
                            {t('organizations.card.view')}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => setProjectToDelete(project.id)}
                        >
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs text-muted-foreground">
                      {t('organization-detail.projects.environments-count', { count: (project as any).environmentCount ?? 0 })}
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">
                      {t('organization-detail.projects.flags-count', { count: (project as any).flagCount ?? 0 })}
                    </span>
                  </div>
                  <Button variant="secondary" className="w-full" asChild>
                    <Link to={`/projects/${project.id}?orgId=${orgId}`}>
                      {t('organization-detail.projects.view')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Project Dialog */}
      <Dialog open={!!projectToDelete} onOpenChange={() => setProjectToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this project? This will permanently delete the project and all associated feature flags. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectToDelete(null)} disabled={isDeletingProject}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteProject} disabled={isDeletingProject}>
              {isDeletingProject ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            {t('organization-detail.danger-zone.title')}
          </CardTitle>
          <CardDescription>
            {t('organization-detail.danger-zone.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button variant="destructive">{t('organization-detail.danger-zone.delete-button')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('organization-detail.delete-dialog.title')}</DialogTitle>
                <DialogDescription dangerouslySetInnerHTML={{ 
                  __html: t('organization-detail.delete-dialog.description', { name: currentOrganization.name }) 
                }} />
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                  {t('organization-detail.delete-dialog.cancel')}
                </Button>
                <Button variant="destructive" onClick={handleDelete}>
                  {t('organization-detail.delete-dialog.confirm')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
