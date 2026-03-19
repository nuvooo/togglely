import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle, LogIn } from 'lucide-react';
import api from '@/lib/axios';

interface InviteInfo {
  email: string;
  organizationName: string;
  role: string;
  existingUser: boolean;
}

export default function InviteAccept() {
  const { token: inviteToken } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // For new users
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Check if user is logged in
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    const authToken = localStorage.getItem('token');
    setIsLoggedIn(!!authToken);

    const fetchInviteInfo = async () => {
      if (!inviteToken) {
        setError('Invalid invite link');
        setIsLoading(false);
        return;
      }
      try {
        const response = await api.get(`/auth/invite/${inviteToken}`);
        setInviteInfo(response.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Invalid or expired invite link');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInviteInfo();
  }, [inviteToken]);

  const handleAcceptAsExisting = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await api.post(`/auth/invite/${inviteToken}/accept`);
      setSuccess(true);
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to accept invite');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.post(`/auth/invite/${inviteToken}/register`, {
        firstName,
        lastName,
        password,
      });
      setSuccess(true);
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !inviteInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-4 text-center">
              <Link to="/login" className="text-primary hover:underline">
                Go to login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">
              {inviteInfo?.existingUser ? 'Welcome!' : 'Account Created!'}
            </h2>
            <p className="text-muted-foreground mb-4">
              You have successfully joined <strong>{inviteInfo?.organizationName}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              {inviteInfo?.existingUser 
                ? 'Redirecting to dashboard...' 
                : 'Redirecting to login in a few seconds...'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Existing user view
  if (inviteInfo?.existingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Join Organization</CardTitle>
            <CardDescription className="text-center">
              You've been invited to join <strong>{inviteInfo?.organizationName}</strong> as a{' '}
              <strong>{inviteInfo?.role}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={inviteInfo?.email}
                  disabled
                  className="bg-muted"
                />
              </div>

              {isLoggedIn ? (
                <Button 
                  onClick={handleAcceptAsExisting} 
                  className="w-full" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    'Accept Invite & Join'
                  )}
                </Button>
              ) : (
                <>
                  <Alert className="mb-4">
                    <LogIn className="h-4 w-4" />
                    <AlertDescription>
                      You already have an account. Please sign in to accept this invite.
                    </AlertDescription>
                  </Alert>
                  <Button 
                    onClick={() => navigate('/login', { state: { redirectTo: `/invite/${inviteToken}` } })} 
                    className="w-full"
                  >
                    Sign In to Accept
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // New user registration view
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Join Organization</CardTitle>
          <CardDescription className="text-center">
            You've been invited to join <strong>{inviteInfo?.organizationName}</strong> as a{' '}
            <strong>{inviteInfo?.role}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <form onSubmit={handleSubmitNewUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={inviteInfo?.email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                This email is associated with your invite
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Create Account & Join'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
