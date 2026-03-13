import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings, Trash2, Globe, AlertTriangle } from 'lucide-react';
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

interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  organizationId: string;
  organizationName: string;
  createdAt: string;
}

export default function ProjectSettings() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!projectId) return;
    
    const fetchProject = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/projects/${projectId}`);
        const data = response.data;
        setProject(data);
        setName(data.name || '');
        setDescription(data.description || '');
      } catch (error) {
        console.error('Failed to fetch project:', error);
        setMessage({ type: 'error', text: 'Failed to load project' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await api.patch(`/projects/${projectId}`, {
        name,
        description,
      });
      setProject(response.data);
      setMessage({ type: 'success', text: 'Project updated successfully' });
    } catch (error: any) {
      console.error('Failed to update project:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to update project' 
      });
    } finally {
      setIsSaving(false);
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
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/organizations" className="hover:text-foreground transition-colors">
          {t('organization-detail.breadcrumb.organizations')}
        </Link>
        <span>/</span>
        <Link to={`/organizations/${project.organizationId}`} className="hover:text-foreground transition-colors">
          {project.organizationName || 'Organization'}
        </Link>
        <span>/</span>
        <Link to={`/projects/${projectId}?orgId=${project.organizationId}`} className="hover:text-foreground transition-colors">
          {project.name}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Settings</span>
      </div>

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

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{project.name}</strong>? 
              This will permanently delete the project and all associated feature flags.
              This action cannot be undone.
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
    </div>
  );
}
