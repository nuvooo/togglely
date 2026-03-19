import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Users, UserPlus, Trash2, Mail, Clock } from 'lucide-react';
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

interface Member {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  joinedAt: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  createdAt: string;
  expiresAt: string;
}

interface Organization {
  id: string;
  name: string;
}

export default function OrganizationMembers() {
  const { t: _t } = useTranslation();
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    
    fetchData();
  }, [orgId]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [orgRes, membersRes, invitesRes] = await Promise.all([
        api.get(`/organizations/${orgId}`),
        api.get(`/organizations/${orgId}/members`),
        api.get(`/organizations/${orgId}/invites`),
      ]);
      setOrganization(orgRes.data.organization || orgRes.data);
      setMembers(membersRes.data.members || membersRes.data || []);
      setPendingInvites(invitesRes.data.invites || []);
      
      // Get current user's role
      const meRes = await api.get('/auth/me');
      const myMembership = membersRes.data.members?.find((m: Member) => m.userId === meRes.data.user?.id);
      setCurrentUserRole(myMembership?.role || null);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setMessage({ type: 'error', text: 'Failed to load members' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    
    setIsInviting(true);
    setMessage(null);
    setInviteUrl(null);

    try {
      const response = await api.post(`/organizations/${orgId}/invites`, {
        email: inviteEmail,
        role: inviteRole,
      });
      
      if (response.data.inviteUrl) {
        // Invite created
        setInviteUrl(window.location.origin + response.data.inviteUrl);
        setMessage({ 
          type: 'success', 
          text: response.data.message || 'Invite created! Send the link below to the user.' 
        });
        // Refresh pending invites
        const invitesRes = await api.get(`/organizations/${orgId}/invites`);
        setPendingInvites(invitesRes.data.invites || []);
      }
    } catch (error: any) {
      console.error('Failed to invite member:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to invite member' 
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!orgId) return;
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      await api.delete(`/organizations/${orgId}/members/${userId}`);
      setMembers(members.filter(m => m.userId !== userId));
      setMessage({ type: 'success', text: 'Member removed successfully' });
    } catch (error: any) {
      console.error('Failed to remove member:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to remove member' 
      });
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!orgId) return;

    try {
      const response = await api.patch(`/organizations/${orgId}/members/${userId}`, {
        role: newRole,
      });
      setMembers(members.map(m => m.userId === userId ? { ...m, role: newRole as any } : m));
      setMessage({ type: 'success', text: 'Role updated successfully' });
    } catch (error: any) {
      console.error('Failed to update role:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to update role' 
      });
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!orgId) return;
    if (!confirm('Are you sure you want to cancel this invite?')) return;

    try {
      await api.delete(`/organizations/${orgId}/invites/${inviteId}`);
      setPendingInvites(pendingInvites.filter(i => i.id !== inviteId));
      setMessage({ type: 'success', text: 'Invite cancelled successfully' });
    } catch (error: any) {
      console.error('Failed to cancel invite:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to cancel invite' 
      });
    }
  };

  const canManageMembers = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';
  const canChangeRoles = currentUserRole === 'OWNER';

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'OWNER':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'ADMIN':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'MEMBER':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800';
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
          Organizations
        </Link>
        <span>/</span>
        <Link to={`/organizations/${orgId}`} className="hover:text-foreground transition-colors">
          {organization.name}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Members</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(`/organizations/${orgId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Organization Members</h1>
            <p className="text-muted-foreground text-sm">Manage members and their roles</p>
          </div>
        </div>
        {canManageMembers && (
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Invite Member
          </Button>
        )}
      </div>

      <Separator />

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
          {message.text}
        </div>
      )}

      {/* Pending Invites */}
      {pendingInvites.length > 0 && canManageMembers && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Mail className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <CardTitle>Pending Invites ({pendingInvites.length})</CardTitle>
                <CardDescription>Invites waiting to be accepted</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between p-4 rounded-lg border bg-amber-50/50">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-medium">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium">{invite.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Invited {new Date(invite.createdAt).toLocaleDateString()}
                        {' · '}
                        Expires {new Date(invite.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge className={getRoleBadgeColor(invite.role)}>
                      {invite.role}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleCancelInvite(invite.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members List */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Members ({members.length})</CardTitle>
              <CardDescription>People with access to this organization</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No members found
            </div>
          ) : (
            <div className="space-y-4">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-medium">
                      {(member.firstName?.[0] || member.email?.[0] || '?').toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">
                        {member.firstName && member.lastName 
                          ? `${member.firstName} ${member.lastName}`
                          : member.email
                        }
                      </p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {canChangeRoles && member.role !== 'OWNER' ? (
                      <Select 
                        value={member.role} 
                        onValueChange={(value) => handleUpdateRole(member.userId, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="MEMBER">Member</SelectItem>
                          <SelectItem value="VIEWER">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className={getRoleBadgeColor(member.role)}>
                        {member.role}
                      </Badge>
                    )}
                    {canManageMembers && member.role !== 'OWNER' && (
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleRemoveMember(member.userId)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={(open) => {
        setShowInviteDialog(open);
        if (!open) {
          setInviteUrl(null);
          setMessage(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Invite a new member to {organization.name}
            </DialogDescription>
          </DialogHeader>
          
          {inviteUrl ? (
            <div className="space-y-4 py-4">
              <div className={`p-4 rounded-lg bg-green-50 text-green-800 border border-green-200`}>
                {message?.text}
              </div>
              <div className="space-y-2">
                <Label>Invite Link</Label>
                <div className="flex gap-2">
                  <Input 
                    value={inviteUrl} 
                    readOnly 
                    className="flex-1"
                  />
                  <Button 
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteUrl);
                      setMessage({ type: 'success', text: 'Link copied to clipboard!' });
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Send this link to {inviteEmail}. They will be able to join your organization.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => {
                  setShowInviteDialog(false);
                  setInviteUrl(null);
                  setInviteEmail('');
                  setMessage(null);
                }}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleInvite}>
              <div className="space-y-4 py-4">
                {message && message.type === 'error' && (
                  <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                    {message.text}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin - Can manage projects and members</SelectItem>
                      <SelectItem value="MEMBER">Member - Can create and manage feature flags</SelectItem>
                      <SelectItem value="VIEWER">Viewer - Read-only access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowInviteDialog(false)} disabled={isInviting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isInviting || !inviteEmail}>
                  {isInviting ? 'Creating Invite...' : 'Create Invite'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
