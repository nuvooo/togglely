import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings, Trash2, Users, AlertTriangle } from 'lucide-react';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrganizationStore } from '@/store/organizationStore';

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
}

interface OrganizationMember {
  id: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export default function OrganizationSettings() {
  const { t } = useTranslation();
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { deleteOrganization } = useOrganizationStore();
  
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!orgId) return;
    
    const fetchOrganization = async () => {
      try {
        setIsLoading(true);
        const [orgRes, membersRes, meRes] = await Promise.all([
          api.get(`/organizations/${orgId}`),
          api.get(`/organizations/${orgId}/members`),
          api.get('/auth/me'),
        ]);
        const data = orgRes.data.organization || orgRes.data;
        setOrganization(data);
        setName(data.name || '');
        setDescription(data.description || '');
        
        // Find current user's role
        const members = membersRes.data.members || membersRes.data || [];
        const currentUser = members.find((m: OrganizationMember) => m.userId === meRes.data.user?.id);
        setCurrentUserRole(currentUser?.role || null);
      } catch (error) {
        console.error('Failed to fetch organization:', error);
        setMessage({ type: 'error', text: 'Failed to load organization' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrganization();
  }, [orgId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await api.patch(`/organizations/${orgId}`, {
        name,
        description,
      });
      setOrganization(response.data.organization || response.data);
      setMessage({ type: 'success', text: 'Organization updated successfully' });
    } catch (error: any) {
      console.error('Failed to update organization:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to update organization' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!orgId) return;
    setIsDeleting(true);
    try {
      await deleteOrganization(orgId);
      navigate('/organizations');
    } catch (error: any) {
      console.error('Failed to delete organization:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to delete organization' 
      });
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-destructive">Organization not found</p>
        <Button className="mt-4" onClick={() => navigate('/organizations')}>
          Back to Organizations
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
        <span>/</span>
        <Link to={`/organizations/${orgId}`} className="hover:text-foreground transition-colors">
          {organization.name}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Settings</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate(`/organizations/${orgId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organization Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your organization settings</p>
        </div>
      </div>

      <Separator />

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
          {message.text}
        </div>
      )}

      {/* General Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Update your organization information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Organization"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Organization Slug</Label>
              <Input
                id="slug"
                value={organization.slug}
                disabled
                className="font-mono bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Organization slug cannot be changed after creation.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Organization description (optional)"
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

      {/* Members Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Members</CardTitle>
              <CardDescription>Manage organization members</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigate(`/organizations/${orgId}/members`)}>
            Manage Members
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone - Only visible to OWNER */}
      {currentUserRole === 'OWNER' && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Once you delete an organization, there is no going back. Please be certain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Organization
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Organization</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{organization.name}</strong>? 
              This will permanently delete the organization, all projects, feature flags, and members.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
