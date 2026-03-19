import { useEffect, useState } from 'react';
import { X, Check, Building2, Shield, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/axios';

interface PendingInvite {
  id: string;
  token: string;
  organizationId: string;
  organizationName: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  createdAt: string;
  expiresAt: string;
}

export default function PendingInvitesBanner() {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchPendingInvites();
  }, []);

  const fetchPendingInvites = async () => {
    try {
      const response = await api.get('/auth/pending-invites');
      setInvites(response.data.invites || []);
    } catch (error) {
      console.error('Failed to fetch pending invites:', error);
    }
  };

  const handleAccept = async (invite: PendingInvite) => {
    setAcceptingId(invite.id);
    try {
      await api.post(`/auth/invite/${invite.token}/accept`);
      // Remove accepted invite from list
      setInvites(invites.filter(i => i.id !== invite.id));
      // Refresh page to show new organization
      window.location.reload();
    } catch (error: any) {
      console.error('Failed to accept invite:', error);
      alert(error.response?.data?.error || 'Failed to accept invite');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  if (dismissed || invites.length === 0) {
    return null;
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'OWNER':
        return <Shield className="w-4 h-4 text-purple-500" />;
      case 'ADMIN':
        return <Shield className="w-4 h-4 text-blue-500" />;
      default:
        return <User className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {invites.map((invite) => (
          <div 
            key={invite.id} 
            className="flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  You've been invited to join{' '}
                  <span className="font-semibold">{invite.organizationName}</span>
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {getRoleIcon(invite.role)}
                  <span className="text-xs text-gray-600 capitalize">
                    {invite.role.toLowerCase()} access
                  </span>
                  <span className="text-xs text-gray-400">
                    · Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => handleAccept(invite)}
                disabled={acceptingId === invite.id}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {acceptingId === invite.id ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    Joining...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Accept
                  </>
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
