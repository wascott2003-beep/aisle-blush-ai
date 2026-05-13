import { motion } from 'framer-motion';
import { Plus, Calendar, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Wedding } from '@/lib/types';

interface DashboardProps {
  weddings: Wedding[];
  onSelectWedding: (id: string) => void;
  onNewWedding: () => void;
}

const Dashboard = ({ weddings, onSelectWedding, onNewWedding }: DashboardProps) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-heading font-semibold text-foreground">Your Projects</h1>
          <p className="text-muted-foreground font-body mt-1">Manage your weddings and event content</p>
        </div>
        <Button
          onClick={onNewWedding}
          className="gradient-rose text-primary-foreground font-body font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      {weddings.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20"
        >
          <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center mx-auto mb-4">
            <ImageIcon className="w-8 h-8 text-rose-gold" />
          </div>
          <h2 className="font-heading text-xl text-foreground mb-2">No projects yet</h2>
          <p className="text-muted-foreground font-body mb-6">Create your first project to get started</p>
          <Button
            onClick={onNewWedding}
            className="gradient-rose text-primary-foreground font-body hover:opacity-90"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {weddings.map((wedding, i) => (
            <motion.div
              key={wedding.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => onSelectWedding(wedding.id)}
              className="group cursor-pointer bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg hover:border-rose-gold-light/50 transition-all duration-300"
            >
              <div className="aspect-[16/10] bg-accent relative overflow-hidden">
                <div className="absolute inset-0 gradient-rose opacity-20" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <ImageIcon className="w-10 h-10 text-rose-gold/40" />
                </div>
              </div>
              <div className="p-5 space-y-3">
                <h3 className="font-heading text-lg font-semibold text-foreground group-hover:text-rose-gold transition-colors">
                  {wedding.name}
                </h3>
                <div className="flex items-center gap-4 text-sm text-muted-foreground font-body">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(wedding.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" />
                    {wedding.mediaCount} files
                  </span>
                </div>
                {wedding.shortClips.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-gold font-body font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {wedding.shortClips.length} clips to review
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
