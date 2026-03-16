import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FolderIcon,
  ArrowLeftIcon,
  PlusIcon,
  FlagIcon,
  Cog6ToothIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import clsx from 'clsx';

// Helper to validate MongoDB ObjectID format (24-char hex)
const isValidObjectId = (id: string | undefined | null): id is string => {
  if (!id || typeof id !== 'string') return false;
  if (id === 'undefined' || id === 'null' || id === 'new') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};

interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  type: 'SINGLE' | 'MULTI';
  organizationId: string;
  organizationName: string;
  createdAt: string;
  environments?: Environment[];
}

interface Environment {
  id: string;
  name: string;
  key: string;
}

interface BrandFlagValue {
  brandId: string;
  brandName: string;
  enabled: boolean;
  defaultValue: string;
  isCustom: boolean;
}

interface FlagEnvironment {
  id: string;
  environmentId: string;
  environmentName: string;
  enabled: boolean;
  defaultValue: string;
  brandValues?: BrandFlagValue[];  // Brand values per environment
}

interface FeatureFlag {
  id: string;
  name: string;
  key: string;
  description: string | null;
  flagType: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON';
  environments: FlagEnvironment[];
  createdAt: string;
  updatedAt: string;
}

export default function ProjectDetail() {
  const { t } = useTranslation();
  const { orgId: orgIdFromParams, projectId } = useParams<{ orgId: string; projectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orgId = orgIdFromParams || searchParams.get('orgId') || '';
  const [project, setProject] = useState<Project | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateFlagDialog, setShowCreateFlagDialog] = useState(false);
  const [newFlagName, setNewFlagName] = useState('');
  const [newFlagKey, setNewFlagKey] = useState('');
  const [newFlagType, setNewFlagType] = useState<'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'>('BOOLEAN');
  const [isCreatingFlag, setIsCreatingFlag] = useState(false);
  
  // Delete flag dialog state
  const [flagToDelete, setFlagToDelete] = useState<FeatureFlag | null>(null);
  const [isDeletingFlag, setIsDeletingFlag] = useState(false);
  
  // Edit flag value dialog state
  const [editingFlagEnv, setEditingFlagEnv] = useState<{flag: FeatureFlag, env: FlagEnvironment} | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSavingValue, setIsSavingValue] = useState(false);
  
  // Brand management
  const [isMultiTenant, setIsMultiTenant] = useState(false);
  const [togglingBrandFlags, setTogglingBrandFlags] = useState<Set<string>>(new Set());

  // Validate IDs early
  const validOrgId = isValidObjectId(orgId) ? orgId : null;
  const validProjectId = isValidObjectId(projectId) ? projectId : null;

  const fetchData = async () => {
    if (!validProjectId) return;
    
    try {
      setIsLoading(true);
      
      // Use optimized API for multi-tenant projects
      const projectRes = await api.get(`/projects/${validProjectId}`);
      setProject(projectRes.data);
      setIsMultiTenant(projectRes.data.type === 'MULTI');
      
      if (projectRes.data.type === 'MULTI') {
        // Use new optimized endpoint that returns all flags with brand values
        const flagsWithBrandsRes = await api.get(`/projects/${validProjectId}/flags-with-brands`);
        setFeatureFlags(flagsWithBrandsRes.data.flags);
      } else {
        // For single-tenant, use simple endpoint
        const flagsRes = await api.get(`/feature-flags/project/${validProjectId}`);
        setFeatureFlags(flagsRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch project data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!validOrgId || !validProjectId) {
      setIsLoading(false);
      return;
    }

    fetchData();
  }, [validOrgId, validProjectId]);

  const generateKey = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleNameChange = (value: string) => {
    setNewFlagName(value);
    if (!newFlagKey || newFlagKey === generateKey(newFlagName)) {
      setNewFlagKey(generateKey(value));
    }
  };

  const handleCreateFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validProjectId) return;
    setIsCreatingFlag(true);
    try {
      // Determine default value based on type
      const defaultValue = newFlagType === 'BOOLEAN' ? 'false' :
                          newFlagType === 'NUMBER' ? '0' :
                          newFlagType === 'JSON' ? '{}' : '';
      
      const response = await api.post(`/feature-flags/project/${validProjectId}`, {
        name: newFlagName,
        key: newFlagKey,
        flagType: newFlagType,
        defaultValue,
      });
      // Response now includes environments from backend
      setFeatureFlags([response.data, ...featureFlags]);
      setShowCreateFlagDialog(false);
      setNewFlagName('');
      setNewFlagKey('');
      setNewFlagType('BOOLEAN');
    } catch (error) {
      console.error('Failed to create feature flag:', error);
    } finally {
      setIsCreatingFlag(false);
    }
  };

  const handleToggleFlag = async (flagId: string, environmentId: string, enabled: boolean) => {
    // Optimistic UI update
    const previousFlags = [...featureFlags];
    setFeatureFlags((prev) =>
      prev.map((f) => {
        if (f.id === flagId) {
          return {
            ...f,
            environments: f.environments.map((e) =>
              e.environmentId === environmentId ? { ...e, enabled: !enabled } : e
            ),
          };
        }
        return f;
      })
    );

    try {
      await api.post(`/feature-flags/${flagId}/toggle`, {
        environmentId,
        enabled: !enabled,
      });
      // Optionally refresh after a small delay or trust the local state
    } catch (error) {
      console.error('Failed to toggle flag:', error);
      // Rollback on error
      setFeatureFlags(previousFlags);
    }
  };

  const handleToggleBrandFlag = async (
    brandId: string,
    flagId: string,
    environmentId: string,
    enabled: boolean
  ) => {
    // Optimistic UI update
    const previousFlags = [...featureFlags];
    setFeatureFlags((prev) =>
      prev.map((f) => {
        if (f.id === flagId) {
          return {
            ...f,
            environments: f.environments.map((e) => {
              if (e.environmentId === environmentId) {
                return {
                  ...e,
                  brandValues: e.brandValues?.map((bv) =>
                    bv.brandId === brandId ? { ...bv, enabled: !enabled } : bv
                  ),
                };
              }
              return e;
            }),
          };
        }
        return f;
      })
    );

    const toggleKey = `${flagId}-${environmentId}-${brandId}`;
    setTogglingBrandFlags(prev => new Set(prev).add(toggleKey));

    try {
      await api.post(`/brands/${brandId}/flags/${flagId}/toggle`, {
        environmentId,
        enabled: !enabled,
      });
    } catch (error) {
      console.error('Failed to toggle brand flag:', error);
      // Rollback on error
      setFeatureFlags(previousFlags);
    } finally {
      setTogglingBrandFlags(prev => {
        const next = new Set(prev);
        next.delete(toggleKey);
        return next;
      });
    }
  };

  /* Lines 260-316 omitted */

  const openDeleteDialog = (flag: FeatureFlag) => {
    setFlagToDelete(flag);
  };

  const handleDeleteFlag = async () => {
    if (!flagToDelete) return;
    setIsDeletingFlag(true);
    try {
      await api.delete(`/feature-flags/${flagToDelete.id}`);
      setFeatureFlags(featureFlags.filter(f => f.id !== flagToDelete.id));
      setFlagToDelete(null);
    } catch (error) {
      console.error('Failed to delete flag:', error);
    } finally {
      setIsDeletingFlag(false);
    }
  };

  const openEditValueDialog = (flag: FeatureFlag, env: FeatureFlag['environments'][0]) => {
    setEditingFlagEnv({ flag, env });
    setEditValue(env.defaultValue || '');
  };

  const handleSaveValue = async () => {
    if (!editingFlagEnv || !validProjectId) return;
    setIsSavingValue(true);
    try {
      await api.patch(`/feature-flags/${editingFlagEnv.flag.id}/environments/${editingFlagEnv.env.environmentId}`, {
        defaultValue: editValue,
      });
      
      // Refresh flags using the same logic as initial load
      if (project?.type === 'MULTI') {
        const flagsWithBrandsRes = await api.get(`/projects/${validProjectId}/flags-with-brands`);
        setFeatureFlags(flagsWithBrandsRes.data.flags);
      } else {
        const flagsRes = await api.get(`/feature-flags/project/${validProjectId}`);
        setFeatureFlags(flagsRes.data);
      }
      
      setEditingFlagEnv(null);
    } catch (error) {
      console.error('Failed to save flag value:', error);
    } finally {
      setIsSavingValue(false);
    }
  };

  const filteredFlags = featureFlags.filter(flag =>
    flag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    flag.key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!validOrgId || !validProjectId) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-destructive">Invalid organization or project ID</p>
        <Button className="mt-4" onClick={() => navigate('/organizations')}>
          Back to Organizations
        </Button>
      </div>
    );
  }

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
        <p className="text-muted-foreground">Project not found</p>
        <Button className="mt-4" onClick={() => navigate(`/organizations/${orgId}`)}>
          Back to Organization
        </Button>
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
        {orgId && (
          <>
            <span>/</span>
            <Link to={`/organizations/${orgId}`} className="hover:text-foreground transition-colors">
              {project.organizationName || 'Organization'}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-foreground font-medium">{project.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(`/organizations/${orgId}`)}>
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white font-bold text-xl">
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              <p className="text-muted-foreground text-sm">{project.key}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(`/projects/${projectId}/settings`)}>
            <Cog6ToothIcon className="w-4 h-4 mr-2" />
            Settings
          </Button>
          <Dialog open={showCreateFlagDialog} onOpenChange={setShowCreateFlagDialog}>
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="w-4 h-4 mr-2" />
                New Feature Flag
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Feature Flag</DialogTitle>
                <DialogDescription>
                  Create a new feature flag in {project.name}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateFlag}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="flagName">Flag Name</Label>
                    <Input
                      id="flagName"
                      placeholder="New Feature"
                      value={newFlagName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="flagKey">Flag Key</Label>
                    <Input
                      id="flagKey"
                      placeholder="new-feature"
                      value={newFlagKey}
                      onChange={(e) => setNewFlagKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      required
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="flagType">Type</Label>
                    <select
                      id="flagType"
                      value={newFlagType}
                      onChange={(e) => setNewFlagType(e.target.value as any)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2"
                    >
                      <option value="BOOLEAN">Boolean (true/false)</option>
                      <option value="STRING">String</option>
                      <option value="NUMBER">Number</option>
                      <option value="JSON">JSON</option>
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowCreateFlagDialog(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={isCreatingFlag || !newFlagName || !newFlagKey}>
                    {isCreatingFlag ? t('common.loading') : t('common.create')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Separator />

      {/* Search */}
      <div className="flex items-center justify-between">
        <div className="relative max-w-md w-full">
          <input
            type="text"
            placeholder="Search feature flags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-background"
          />
          <FolderIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
        <Badge variant="secondary">
          {filteredFlags.length} flags
        </Badge>
      </div>

      {/* Feature Flags Table */}
      {filteredFlags.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FlagIcon className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No feature flags yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
              Create your first feature flag to start managing feature toggles
            </p>
            <Button onClick={() => setShowCreateFlagDialog(true)}>
              <PlusIcon className="w-4 h-4 mr-2" />
              Create Feature Flag
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredFlags.map((flag) => (
            <Card key={flag.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold">
                      <FlagIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{flag.name}</h3>
                      <p className="text-sm text-muted-foreground font-mono">{flag.key}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{flag.flagType}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openDeleteDialog(flag)}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* For Multi-Tenant: One card per environment with brands inside */}
                {isMultiTenant ? (
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {flag.environments?.map((env) => (
                      <div
                        key={env.id}
                        className="p-4 rounded-lg border bg-muted border-border"
                      >
                        <h4 className="font-semibold text-foreground mb-3 pb-2 border-b border-border">
                          {env.environmentName}
                        </h4>
                        <div className="space-y-3">
                          {/* List all brands with their toggles - from env.brandValues */}
                          {env.brandValues?.map((brand) => {
                            const toggleKey = `${flag.id}-${env.environmentId}-${brand.brandId}`;
                            const isToggling = togglingBrandFlags.has(toggleKey);
                            
                            return (
                              <div
                                key={brand.brandId}
                                className="flex items-center justify-between p-2 rounded bg-card border border-border"
                              >
                                <div className="flex items-center gap-2">
                                  <Badge 
                                    variant="outline" 
                                    className="text-xs bg-card text-foreground"
                                  >
                                    {brand.brandName}
                                  </Badge>
                                </div>
                                <button
                                  onClick={() => handleToggleBrandFlag(brand.brandId, flag.id, env.environmentId, brand.enabled)}
                                  disabled={isToggling}
                                  className={clsx(
                                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                    brand.enabled ? "bg-green-500 dark:bg-green-600" : "bg-gray-300 dark:bg-gray-600"
                                  )}
                                >
                                  <span
                                    className={clsx(
                                      "inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform",
                                      brand.enabled ? "translate-x-5" : "translate-x-0.5"
                                    )}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 pt-2 border-t border-border text-xs flex items-center gap-2">
                          <span className={env.enabled ? "text-green-800 dark:text-green-200" : "text-muted-foreground"}>Value:</span>{' '}
                          <code className={clsx(
                            "px-1.5 py-0.5 rounded font-mono text-xs",
                            env.enabled 
                              ? "bg-green-100 dark:bg-green-900/50 text-green-900 dark:text-green-100" 
                              : "bg-card text-foreground"
                          )}>
                            {env.defaultValue}
                          </code>
                          {flag.flagType !== 'BOOLEAN' && (
                            <button
                              onClick={() => openEditValueDialog(flag, env)}
                              className="text-xs text-primary hover:text-primary/80 underline"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* For Single-Tenant: Simple environment toggles */
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {flag.environments?.map((env) => (
                      <div
                        key={env.id}
                        className={clsx(
                          "p-4 rounded-lg border transition-colors",
                          env.enabled
                            ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900/50"
                            : "bg-muted border-border"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{env.environmentName}</span>
                          <button
                            onClick={() => handleToggleFlag(flag.id, env.environmentId, env.enabled)}
                            className={clsx(
                              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                              env.enabled ? "bg-green-500 dark:bg-green-600" : "bg-gray-300 dark:bg-gray-600"
                            )}
                          >
                            <span
                              className={clsx(
                                "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
                                env.enabled ? "translate-x-6" : "translate-x-1"
                              )}
                            />
                          </button>
                        </div>
                        <div className="mt-2 text-sm flex items-center gap-2">
                          <span className={env.enabled ? "text-green-800 dark:text-green-200" : "text-muted-foreground"}>Value:</span>{' '}
                          <code className={clsx(
                            "px-1.5 py-0.5 rounded font-mono text-xs",
                            env.enabled 
                              ? "bg-green-100 dark:bg-green-900/50 text-green-900 dark:text-green-100" 
                              : "bg-card text-foreground"
                          )}>
                            {env.defaultValue}
                          </code>
                          {flag.flagType !== 'BOOLEAN' && (
                            <button
                              onClick={() => openEditValueDialog(flag, env)}
                              className="text-xs text-primary hover:text-primary/80 underline"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Flag Dialog */}
      <Dialog open={!!flagToDelete} onOpenChange={() => setFlagToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Feature Flag</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{flagToDelete?.name}</strong>? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagToDelete(null)} disabled={isDeletingFlag}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteFlag} disabled={isDeletingFlag}>
              {isDeletingFlag ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Flag Value Dialog */}
      <Dialog open={!!editingFlagEnv} onOpenChange={() => setEditingFlagEnv(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Flag Value</DialogTitle>
            <DialogDescription>
              Update the value for <strong>{editingFlagEnv?.flag.name}</strong> in {editingFlagEnv?.env.environmentName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="flagValue">Value ({editingFlagEnv?.flag.flagType})</Label>
              {editingFlagEnv?.flag.flagType === 'JSON' ? (
                <textarea
                  id="flagValue"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                  placeholder='{"enabled": true}'
                />
              ) : editingFlagEnv?.flag.flagType === 'NUMBER' ? (
                <Input
                  id="flagValue"
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="0"
                />
              ) : (
                <Input
                  id="flagValue"
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Enter value"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFlagEnv(null)} disabled={isSavingValue}>
              Cancel
            </Button>
            <Button onClick={handleSaveValue} disabled={isSavingValue}>
              {isSavingValue ? 'Saving...' : 'Save Value'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
