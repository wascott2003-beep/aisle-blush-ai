import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles, Heart, Camera, PartyPopper, Gem, FolderOpen, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Wedding } from '@/lib/types';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, Heart, Camera, PartyPopper, Gem, FolderOpen,
};

interface WeddingDetailProps {
  wedding: Wedding;
  onBack: () => void;
  onReview: () => void;
}

const WeddingDetail = ({ wedding, onBack, onReview }: WeddingDetailProps) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-heading font-semibold text-foreground">{wedding.name}</h1>
          <p className="text-muted-foreground font-body mt-1">
            {new Date(wedding.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {' · '}{wedding.mediaCount} files
          </p>
        </div>
        {wedding.shortClips.length > 0 && (
          <Button
            onClick={onReview}
            variant="outline"
            className="border-rose-gold text-rose-gold hover:bg-accent font-body"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Review {wedding.shortClips.length} Short Clips
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {wedding.folders.map((folder, i) => {
          const Icon = iconMap[folder.icon] || FolderOpen;
          return (
            <motion.div
              key={folder.name}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-card rounded-xl border border-border p-6 hover:shadow-md hover:border-rose-gold-light/40 transition-all duration-300 cursor-pointer"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                  <Icon className="w-5 h-5 text-rose-gold" />
                </div>
                <div>
                  <h3 className="font-heading font-medium text-foreground">{folder.name}</h3>
                  <p className="text-xs text-muted-foreground font-body">{folder.items.length} items</p>
                </div>
              </div>
              {folder.items.length > 0 ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {folder.items.slice(0, 8).map((item, j) => (
                    <div key={item.id} className="aspect-square rounded bg-accent flex items-center justify-center">
                      <ImageIcon className="w-3 h-3 text-muted-foreground/40" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-12 flex items-center justify-center text-xs text-muted-foreground font-body">
                  No items yet
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default WeddingDetail;
