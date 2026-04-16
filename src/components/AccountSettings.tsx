import { motion } from 'framer-motion';
import { User, Bell, Shield, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const AccountSettings = () => {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-heading font-semibold text-foreground mb-2">Account Settings</h1>
        <p className="text-muted-foreground font-body mb-8">Manage your profile and preferences</p>

        <div className="space-y-8">
          {/* Profile Section */}
          <section className="bg-card rounded-xl border border-border p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <User className="w-5 h-5 text-rose-gold" />
              <h2 className="font-heading text-lg font-medium text-foreground">Profile</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-body font-medium text-foreground mb-1.5">Name</label>
                <Input defaultValue="Jane Doe" className="h-11 bg-background border-border rounded-lg font-body" />
              </div>
              <div>
                <label className="block text-sm font-body font-medium text-foreground mb-1.5">Email</label>
                <Input defaultValue="jane@example.com" className="h-11 bg-background border-border rounded-lg font-body" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-body font-medium text-foreground mb-1.5">Business Name</label>
              <Input defaultValue="Jane Doe Films" className="h-11 bg-background border-border rounded-lg font-body" />
            </div>
          </section>

          {/* Notifications */}
          <section className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <Bell className="w-5 h-5 text-rose-gold" />
              <h2 className="font-heading text-lg font-medium text-foreground">Notifications</h2>
            </div>
            <div className="space-y-3">
              {['Email notifications for new uploads', 'Weekly project summary', 'AI sorting complete alerts'].map((label) => (
                <label key={label} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded accent-rose-gold" />
                  <span className="text-sm font-body text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Storage */}
          <section className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-rose-gold" />
              <h2 className="font-heading text-lg font-medium text-foreground">Storage</h2>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-body">
                <span className="text-muted-foreground">Used</span>
                <span className="text-foreground font-medium">12.4 GB / 50 GB</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full gradient-rose rounded-full" style={{ width: '25%' }} />
              </div>
            </div>
          </section>

          <Button className="gradient-rose text-primary-foreground font-body font-medium hover:opacity-90 transition-opacity">
            Save Changes
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default AccountSettings;
