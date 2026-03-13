import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Users, UserPlus, Trash2 } from 'lucide-react';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [orgRes, membersRes] = await Promise.all([
          api.get(`/organizations/${orgId}`),
          api.get(`/organizations/${orgId}/members`),
        ]);
        setOrganization(orgRes.data);
        setMembers(membersRes.data);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setMessage({ type: 'error', text: 'Failed to load members' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [orgId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    
    setIsInviting(true);
    setMessage(null);

    try {
      const response = await api.post(`/organizations/${orgId}/members`, {
        email: inviteEmail,
        role: inviteRole,
      });
      setMembers([...members, response.data]);
      setShowInviteDialog(false);
      setInviteEmail('');
      setInviteRole('MEMBER');
      setMessage({ type: 'success', text: 'Member invited successfully' });
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
        <Button onClick={() => setShowInviteDialog(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Member
        </Button>
      </div>

      <Separator />

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
          {message.text}
        </div>
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
                      {(member.firstName?.[0] || member.email[0]).toUpperCase()}
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
                    <Badge className={getRoleBadgeColor(member.role)}>
                      {member.role}
                    </Badge>
                    {member.role !== 'OWNER' && (
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
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Invite a new member to {organization.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite}>
            <div className="space-y-4 py-4">
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
                {isInviting ? 'Inviting...' : 'Invite Member'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
