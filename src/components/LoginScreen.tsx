import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import heroImg from '@/assets/wedding-hero.jpg';
import logo from '@/assets/aisle-logo.png';

interface LoginScreenProps {
  onLogin: () => void;
}

const LoginScreen = ({ onLogin }: LoginScreenProps) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      // Auth state listener in Index.tsx handles the rest
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
        <img src={heroImg} alt="Wedding flowers" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 gradient-rose opacity-30" />
        <div className="absolute inset-0 flex items-end p-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
            <p className="text-primary-foreground/80 font-body text-lg max-w-md">
              AI-powered media management for wedding content creators
            </p>
          </motion.div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 gradient-blush">
        <motion.div className="w-full max-w-md space-y-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="text-center space-y-3">
            <img src={logo} alt="Aisle AI" className="w-16 h-16 mx-auto" />
            <h1 className="text-4xl font-heading font-semibold text-foreground">
              Aisle <span className="text-gradient-rose">AI</span>
            </h1>
            <p className="text-muted-foreground font-body">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <Input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 bg-card border-border rounded-lg font-body" />
              </motion.div>
            )}
            <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 bg-card border-border rounded-lg font-body" />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 bg-card border-border rounded-lg font-body" />

            {error && <p className="text-sm text-destructive font-body">{error}</p>}

            <Button type="submit" disabled={submitting} className="w-full h-12 gradient-rose text-primary-foreground font-body font-medium text-base rounded-lg hover:opacity-90 transition-opacity">
              <Heart className="w-4 h-4 mr-2" />
              {submitting ? 'Please wait…' : isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground font-body">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="text-rose-gold font-medium hover:underline">
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginScreen;
