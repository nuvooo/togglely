import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyIcon,
  PlusIcon,
  Copy,
  EyeIcon,
  EyeOff,
  ServerIcon,
  Code2,
  CheckCircleIcon,
  TrashIcon,
  Building2,
  MoreVertical,
} from 'lucide-react';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import clsx from 'clsx';

interface ApiKey {
  id: string;
  name: string;
  type: 'SERVER' | 'CLIENT' | 'SDK';
  key: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  organization?: {
    id: string;
    name: string;
  };
}

interface Organization {
  id: string;
  name: string;
  role?: string;
}

export default function ApiKeys() {
  const { t: _t } = useTranslation();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  
  const [newKeyData, setNewKeyData] = useState({
    name: '',
    type: 'SERVER' as ApiKey['type'],
    organizationId: '',
    expiresInDays: '30',
  });
  
  // Revoke state
  const [isRevoking, setIsRevoking] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [keysRes, orgsRes] = await Promise.all([
        api.get('/api-keys/my'),
        api.get('/organizations'),
      ]);
      setApiKeys(Array.isArray(keysRes.data) ? keysRes.data : keysRes.data.apiKeys || []);
      // Store organizations with their roles
      const orgs = orgsRes.data.organizations || orgsRes.data || [];
      setOrganizations(orgs);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const canManageApiKeys = (orgId: string) => {
    const org = organizations.find(o => o.id === orgId);
    return org?.role === 'OWNER' || org?.role === 'ADMIN';
  };

  const userCanCreateKeys = organizations.some(o => o.role === 'OWNER' || o.role === 'ADMIN');

  useEffect(() => {
    fetchData();
  }, []);

  const createApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);
    
    try {
      const response = await api.post(`/api-keys/organization/${newKeyData.organizationId}`, {
        name: newKeyData.name,
        type: newKeyData.type,
        expiresInDays: newKeyData.expiresInDays ? parseInt(newKeyData.expiresInDays) : null,
      });
      
      const newKey = response.data;
      setApiKeys([newKey, ...apiKeys]);
      setNewlyCreatedKey(newKey.key);
      
      // Reset form
      setNewKeyData({ name: '', type: 'SERVER', organizationId: '', expiresInDays: '30' });
      setIsModalOpen(false);
      
      // Refresh to get the masked version
      await fetchData();
    } catch (err: any) {
      console.error('Failed to create API key:', err);
      setCreateError(err.response?.data?.error || 'Failed to create API key');
    } finally {
      setIsCreating(false);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key?')) {
      return;
    }
    
    setIsRevoking(keyId);
    try {
      await api.delete(`/api-keys/${keyId}`);
      setApiKeys(apiKeys.filter((k) => k.id !== keyId));
    } catch (err: any) {
      console.error('Failed to revoke API key:', err);
      alert(err.response?.data?.error || 'Failed to revoke API key');
    } finally {
      setIsRevoking(null);
    }
  };

  const toggleKeyVisibility = (keyId: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyId)) {
        next.delete(keyId);
      } else {
        next.add(keyId);
      }
      return next;
    });
  };

  const copyKeyToClipboard = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'SERVER':
        return ServerIcon;
      case 'CLIENT':
        return Code2;
      case 'SDK':
        return KeyIcon;
      default:
        return KeyIcon;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'SERVER':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400';
      case 'CLIENT':
        return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400';
      case 'SDK':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400';
      default:
        return 'bg-muted text-foreground';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Manage API keys for accessing the Togglely API
          </p>
        </div>
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          {userCanCreateKeys && (
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="w-4 h-4 mr-2" />
                Create API Key
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
              <DialogDescription>
                Create a new API key for accessing the Togglely API
              </DialogDescription>
            </DialogHeader>
            
            {createError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {createError}
              </div>
            )}

            <form onSubmit={createApiKey} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="key-org">
                  Organization <span className="text-red-500">*</span>
                </Label>
                <select
                  id="key-org"
                  value={newKeyData.organizationId}
                  onChange={(e) => setNewKeyData({ ...newKeyData, organizationId: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  required
                  disabled={isCreating}
                >
                  <option value="">Select an organization</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="key-name">
                  Key Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="key-name"
                  value={newKeyData.name}
                  onChange={(e) => setNewKeyData({ ...newKeyData, name: e.target.value })}
                  placeholder="e.g., Production Server Key"
                  required
                  disabled={isCreating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="key-type">Key Type</Label>
                <select
                  id="key-type"
                  value={newKeyData.type}
                  onChange={(e) => setNewKeyData({ ...newKeyData, type: e.target.value as ApiKey['type'] })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  disabled={isCreating}
                >
                  <option value="SERVER">Server (Backend)</option>
                  <option value="CLIENT">Client (Frontend)</option>
                  <option value="SDK">SDK</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Server keys have full access. Client keys have limited read-only access.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="key-expires">Expires In</Label>
                <select
                  id="key-expires"
                  value={newKeyData.expiresInDays}
                  onChange={(e) => setNewKeyData({ ...newKeyData, expiresInDays: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  disabled={isCreating}
                >
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                  <option value="">Never</option>
                </select>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isCreating}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating || !newKeyData.name || !newKeyData.organizationId}>
                  {isCreating ? 'Creating...' : 'Create Key'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Newly Created Key Alert */}
      {newlyCreatedKey && (
        <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-green-800 dark:text-green-400">
                API Key Created Successfully
              </h3>
              <p className="text-sm text-green-700 dark:text-green-500 mt-1">
                Make sure to copy your API key now. You won&apos;t be able to see it again!
              </p>
              <div className="mt-3 flex items-center gap-2 bg-muted rounded-md p-3 border border-border">
                <code className="text-green-600 dark:text-green-400 text-sm font-mono break-all flex-1">
                  {newlyCreatedKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyKeyToClipboard(newlyCreatedKey)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="link"
                className="mt-2 h-auto p-0 text-green-800 dark:text-green-400"
                onClick={() => setNewlyCreatedKey(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* API Keys List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 w-48 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : apiKeys.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <KeyIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No API keys</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-6">
              {userCanCreateKeys 
                ? "Get started by creating a new API key."
                : "Only organization owners and admins can create API keys."}
            </p>
            {userCanCreateKeys && (
              <Button onClick={() => setIsModalOpen(true)}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Create API Key
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {apiKeys.map((apiKey) => {
            const TypeIcon = getTypeIcon(apiKey.type);
            const isRevealed = revealedKeys.has(apiKey.id);

            return (
              <Card key={apiKey.id} className={clsx(!apiKey.isActive && 'opacity-60')}>
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <TypeIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{apiKey.name}</h3>
                          <Badge className={getTypeColor(apiKey.type)}>{apiKey.type}</Badge>
                          {!apiKey.isActive && <Badge variant="secondary">Inactive</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <code className="bg-muted px-2 py-0.5 rounded text-xs">
                            {isRevealed ? apiKey.key : `${apiKey.key.substring(0, 16)}...`}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleKeyVisibility(apiKey.id)}
                          >
                            {isRevealed ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <EyeIcon className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyKeyToClipboard(apiKey.key)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {apiKey.organization && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {apiKey.organization.name}
                            </span>
                          )}
                          <span>Created: {formatDate(apiKey.createdAt)}</span>
                          {apiKey.lastUsedAt && (
                            <span>Last used: {formatDate(apiKey.lastUsedAt)}</span>
                          )}
                          {apiKey.expiresAt && (
                            <span>Expires: {formatDate(apiKey.expiresAt)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions Dropdown - Only show revoke for OWNER/ADMIN */}
                    {canManageApiKeys(apiKey.organization?.id || '') && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => copyKeyToClipboard(apiKey.key)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy key
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => revokeApiKey(apiKey.id)}
                            disabled={isRevoking === apiKey.id || !apiKey.isActive}
                          >
                            <TrashIcon className="mr-2 h-4 w-4" />
                            {isRevoking === apiKey.id ? 'Revoking...' : 'Revoke key'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
