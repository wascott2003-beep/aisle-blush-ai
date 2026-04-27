import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/aisle-logo.png';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery token from the URL hash and fires a
    // PASSWORD_RECOVERY event. We just need to wait for a session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (err: any) {
      setError(err.message || 'Could not update password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 gradient-blush">
      <motion.div className="w-full max-w-md space-y-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="text-center space-y-3">
          <img src={logo} alt="Aisle AI" className="w-16 h-16 mx-auto" />
          <h1 className="text-3xl font-heading font-semibold text-foreground">
            Set a new password
          </h1>
          <p className="text-muted-foreground font-body">
            {ready ? 'Choose a new password for your account' : 'Verifying your reset link…'}
          </p>
        </div>

        {ready && !success && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 bg-card border-border rounded-lg font-body"
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-12 bg-card border-border rounded-lg font-body"
            />

            {error && <p className="text-sm text-destructive font-body">{error}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 gradient-rose text-primary-foreground font-body font-medium text-base rounded-lg hover:opacity-90 transition-opacity"
            >
              <Heart className="w-4 h-4 mr-2" />
              {submitting ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}

        {success && (
          <p className="text-center text-sm text-foreground font-body">
            Password updated! Redirecting…
          </p>
        )}
      </motion.div>
    </div>
  );
};

export default ResetPassword;
