import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings, Trash2, Globe, AlertTriangle, Building2, Plus, MoreVertical, Edit2, ArrowUp, ArrowDown, Shield } from 'lucide-react';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  type: 'SINGLE' | 'MULTI';
  allowedOrigins: string[];
  organizationId: string;
  organizationName: string;
  createdAt: string;
}

interface Environment {
  id: string;
  name: string;
  key: string;
  flagCount: number;
}

interface Brand {
  id: string;
  name: string;
  key: string;
  description: string | null;
}

export default function ProjectSettings() {
  const { t: _t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState<'SINGLE' | 'MULTI'>('SINGLE');
  
  // Environment dialog
  const [showEnvDialog, setShowEnvDialog] = useState(false);
  const [envName, setEnvName] = useState('');
  const [envKey, setEnvKey] = useState('');
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  
  // Brand dialog
  const [showBrandDialog, setShowBrandDialog] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [brandKey, setBrandKey] = useState('');
  const [brandDescription, setBrandDescription] = useState('');
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  
  // Type change confirmation
  const [showTypeChangeDialog, setShowTypeChangeDialog] = useState(false);
  
  // Allowed origins management
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState('');

  useEffect(() => {
    if (!projectId) return;
    
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [projectRes, envsRes, brandsRes] = await Promise.all([
          api.get(`/projects/${projectId}`),
          api.get(`/environments/project/${projectId}`),
          api.get(`/brands/project/${projectId}`),
        ]);
        const projectData = projectRes.data.project;
        setProject(projectData);
        setName(projectData.name || '');
        setDescription(projectData.description || '');
        setProjectType(projectData.type || 'SINGLE');
        setAllowedOrigins(projectData.allowedOrigins || []);
        
        setEnvironments(envsRes.data.environments || []);
        setBrands(brandsRes.data.brands || []);
      } catch (error) {
        console.error('Failed to fetch project:', error);
        setMessage({ type: 'error', text: 'Failed to load project' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    
    // Check if type is changing from MULTI to SINGLE
    if (project?.type === 'MULTI' && projectType === 'SINGLE' && brands.length > 0) {
      setShowTypeChangeDialog(true);
      return;
    }
    
    await saveProject();
  };
  
  const saveProject = async () => {
    if (!projectId) return;
    
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await api.patch(`/projects/${projectId}`, {
        name,
        description,
        type: projectType,
        allowedOrigins,
      });
      setProject(response.data.project);
      setMessage({ 
        type: 'success', 
        text: 'Project updated successfully' 
      });
      // Clear brands if converted to single-tenant
      if (projectType === 'SINGLE') {
        setBrands([]);
      }
    } catch (error: any) {
      console.error('Failed to update project:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to update project' 
      });
    } finally {
      setIsSaving(false);
      setShowTypeChangeDialog(false);
    }
  };

  const handleDelete = async () => {
    if (!projectId) return;
    setIsDeleting(true);
    try {
      await api.delete(`/projects/${projectId}`);
      navigate(`/organizations/${project?.organizationId}`);
    } catch (error: any) {
      console.error('Failed to delete project:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to delete project' 
      });
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleCreateEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !project?.organizationId) return;
    try {
      const response = await api.post(`/environments`, {
        name: envName,
        key: envKey,
        projectId,
        organizationId: project.organizationId,
      });
      setEnvironments([...environments, response.data.environment]);
      setShowEnvDialog(false);
      setEnvName('');
      setEnvKey('');
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to create environment' 
      });
    }
  };

  const handleUpdateEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEnv) return;
    try {
      const response = await api.patch(`/environments/${editingEnv.id}`, {
        name: envName,
      });
      setEnvironments(environments.map(e => e.id === editingEnv.id ? response.data.environment : e));
      setShowEnvDialog(false);
      setEditingEnv(null);
      setEnvName('');
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to update environment' 
      });
    }
  };

  const handleDeleteEnvironment = async (envId: string) => {
    if (!confirm('Are you sure? This will delete all feature flag configurations for this environment.')) return;
    try {
      await api.delete(`/environments/${envId}`);
      setEnvironments(environments.filter(e => e.id !== envId));
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to delete environment' 
      });
    }
  };

  const handleReorderEnvironment = async (envId: string, direction: 'up' | 'down') => {
    const index = environments.findIndex(e => e.id === envId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === environments.length - 1) return;

    const newEnvironments = [...environments];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newEnvironments[index], newEnvironments[targetIndex]] = [newEnvironments[targetIndex], newEnvironments[index]];

    // Optimistic update
    setEnvironments(newEnvironments);

    try {
      await api.post(`/environments/project/${projectId}/reorder`, {
        environmentIds: newEnvironments.map(e => e.id)
      });
    } catch (error: any) {
      // Revert on error
      setEnvironments(environments);
      setMessage({ 
        type: 'error', 
        text: 'Failed to reorder environments' 
      });
    }
  };

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    try {
      const response = await api.post(`/brands/project/${projectId}`, {
        name: brandName,
        key: brandKey,
        description: brandDescription,
      });
      const newBrand = response.data.brand || response.data;
      setBrands([...brands, newBrand]);
      setShowBrandDialog(false);
      setBrandName('');
      setBrandKey('');
      setBrandDescription('');
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to create brand' 
      });
    }
  };

  const handleUpdateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBrand) return;
    try {
      const response = await api.patch(`/brands/${editingBrand.id}`, {
        name: brandName,
        description: brandDescription,
      });
      setBrands(brands.map(b => b.id === editingBrand.id ? response.data : b));
      setShowBrandDialog(false);
      setEditingBrand(null);
      setBrandName('');
      setBrandDescription('');
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to update brand' 
      });
    }
  };

  const handleDeleteBrand = async (brandId: string) => {
    if (!confirm('Are you sure you want to delete this brand?')) return;
    try {
      await api.delete(`/brands/${brandId}`);
      setBrands(brands.filter(b => b.id !== brandId));
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to delete brand' 
      });
    }
  };

  const openEditEnv = (env: Environment) => {
    setEditingEnv(env);
    setEnvName(env.name);
    setShowEnvDialog(true);
  };

  const openEditBrand = (brand: Brand) => {
    setEditingBrand(brand);
    setBrandName(brand.name);
    setBrandDescription(brand.description || '');
    setShowBrandDialog(true);
  };

  const generateKey = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-destructive">Project not found</p>
        <Button className="mt-4" onClick={() => navigate('/organizations')}>
          Back to Organizations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate(`/projects/${projectId}?orgId=${project.organizationId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Project Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your project settings</p>
        </div>
      </div>

      <Separator />

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
          {message.text}
        </div>
      )}

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="environments">Environments</TabsTrigger>
          {projectType === 'MULTI' && <TabsTrigger value="brands">Brands</TabsTrigger>}
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          {/* General Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>General Settings</CardTitle>
                  <CardDescription>Update your project information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Project"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="key">Project Key</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="key"
                      value={project.key}
                      disabled
                      className="pl-10 font-mono bg-muted"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Project key cannot be changed after creation.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Project Type</Label>
                  <Select value={projectType} onValueChange={(v: 'SINGLE' | 'MULTI') => setProjectType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SINGLE">Single - One brand per project</SelectItem>
                      <SelectItem value="MULTI">Multi-Tenant - Multiple brands per project</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Multi-tenant projects allow you to manage feature flags for multiple brands independently.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Project description (optional)"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Once you delete a project, there is no going back. Please be certain.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Project
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="environments">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Environments</CardTitle>
                    <CardDescription>Manage deployment environments</CardDescription>
                  </div>
                </div>
                <Button onClick={() => { setEditingEnv(null); setEnvName(''); setEnvKey(''); setShowEnvDialog(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Environment
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {environments.map((env, index) => (
                  <div key={env.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                        <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="font-medium">{env.name}</p>
                        <p className="text-sm text-muted-foreground font-mono">{env.key}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border rounded-md overflow-hidden mr-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-none border-r"
                          disabled={index === 0}
                          onClick={() => handleReorderEnvironment(env.id, 'up')}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-none"
                          disabled={index === environments.length - 1}
                          onClick={() => handleReorderEnvironment(env.id, 'down')}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <Badge variant="secondary">{env.flagCount} flags</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditEnv(env)}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => handleDeleteEnvironment(env.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {projectType === 'MULTI' && (
          <TabsContent value="brands">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Brands</CardTitle>
                      <CardDescription>Manage brands for multi-tenant project</CardDescription>
                    </div>
                  </div>
                  <Button onClick={() => { setEditingBrand(null); setBrandName(''); setBrandKey(''); setBrandDescription(''); setShowBrandDialog(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Brand
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {brands.map((brand) => (
                    <div key={brand.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <p className="font-medium">{brand.name}</p>
                          <p className="text-sm text-muted-foreground font-mono">{brand.key}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate(`/projects/${projectId}/brands/${brand.id}/flags`)}
                        >
                          Manage Flags
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditBrand(brand)}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDeleteBrand(brand.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="sdk">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>SDK Security</CardTitle>
                  <CardDescription>Configure allowed origins for SDK access</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">About CORS Origins</h4>
                <p className="text-sm text-muted-foreground">
                  Specify which domains are allowed to access your feature flags via the SDK. 
                  Leave empty to allow all origins, or add specific domains for enhanced security.
                </p>
                <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside">
                  <li>Use <code>https://example.com</code> for exact match</li>
                  <li>Use <code>*.example.com</code> to allow all subdomains</li>
                  <li>Use <code>*</code> to allow all origins</li>
                </ul>
              </div>

              <div className="space-y-4">
                <Label>Allowed Origins</Label>
                <div className="flex gap-2">
                  <Input
                    value={newOrigin}
                    onChange={(e) => setNewOrigin(e.target.value)}
                    placeholder="https://example.com or *.example.com"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newOrigin.trim()) {
                          setAllowedOrigins([...allowedOrigins, newOrigin.trim()]);
                          setNewOrigin('');
                        }
                      }
                    }}
                  />
                  <Button
                    onClick={() => {
                      if (newOrigin.trim()) {
                        setAllowedOrigins([...allowedOrigins, newOrigin.trim()]);
                        setNewOrigin('');
                      }
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {allowedOrigins.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No origins configured - all origins will be allowed</p>
                  ) : (
                    allowedOrigins.map((origin, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded bg-background">
                        <code className="text-sm">{origin}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAllowedOrigins(allowedOrigins.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveProject} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Origins'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{project.name}</strong>? 
              This will permanently delete the project and all associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Type Change Warning Dialog */}
      <Dialog open={showTypeChangeDialog} onOpenChange={setShowTypeChangeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Change Project Type?
            </DialogTitle>
            <DialogDescription className="space-y-4">
              <p>
                You are about to change this project from <strong>Multi-Tenant</strong> to <strong>Single-Tenant</strong>.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
                <p className="font-medium mb-2">This will permanently delete:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>All {brands.length} brand(s)</li>
                  <li>All brand-specific flag configurations</li>
                  <li>All brand-specific values and overrides</li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                The default flag values will be preserved. This action cannot be undone.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTypeChangeDialog(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={saveProject} disabled={isSaving}>
              {isSaving ? 'Converting...' : 'Yes, Convert to Single-Tenant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Environment Dialog */}
      <Dialog open={showEnvDialog} onOpenChange={setShowEnvDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEnv ? 'Rename Environment' : 'Add Environment'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editingEnv ? handleUpdateEnvironment : handleCreateEnvironment}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="envName">Environment Name</Label>
                <Input
                  id="envName"
                  value={envName}
                  onChange={(e) => {
                    setEnvName(e.target.value);
                    if (!editingEnv) setEnvKey(generateKey(e.target.value));
                  }}
                  placeholder="Staging"
                  required
                />
              </div>
              {!editingEnv && (
                <div className="space-y-2">
                  <Label htmlFor="envKey">Key</Label>
                  <Input
                    id="envKey"
                    value={envKey}
                    onChange={(e) => setEnvKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="staging"
                    required
                    className="font-mono"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEnvDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingEnv ? 'Save' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Brand Dialog */}
      <Dialog open={showBrandDialog} onOpenChange={setShowBrandDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBrand ? 'Edit Brand' : 'Add Brand'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editingBrand ? handleUpdateBrand : handleCreateBrand}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="brandName">Brand Name</Label>
                <Input
                  id="brandName"
                  value={brandName}
                  onChange={(e) => {
                    setBrandName(e.target.value);
                    if (!editingBrand) setBrandKey(generateKey(e.target.value));
                  }}
                  placeholder="Brand A"
                  required
                />
              </div>
              {!editingBrand && (
                <div className="space-y-2">
                  <Label htmlFor="brandKey">Key</Label>
                  <Input
                    id="brandKey"
                    value={brandKey}
                    onChange={(e) => setBrandKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="brand-a"
                    required
                    className="font-mono"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="brandDescription">Description</Label>
                <Input
                  id="brandDescription"
                  value={brandDescription}
                  onChange={(e) => setBrandDescription(e.target.value)}
                  placeholder="Description (optional)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowBrandDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingBrand ? 'Save' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
