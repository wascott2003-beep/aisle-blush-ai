import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Sparkles, Heart, Camera, PartyPopper, Gem, FolderOpen, Inbox, AlertTriangle, Image as ImageIcon, Film, Clapperboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Wedding, MediaFolder, MediaItem, Vendor } from '@/lib/types';
import MediaViewer from '@/components/MediaViewer';
import VendorSection from '@/components/VendorSection';
import BackgroundUploadIndicator from '@/components/BackgroundUploadIndicator';
import SortFootageButton from '@/components/SortFootageButton';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, Heart, Camera, PartyPopper, Gem, FolderOpen, Inbox,
};

interface WeddingDetailProps {
  wedding: Wedding;
  onBack: () => void;
  onReview: () => void;
  onDeleteItem?: (folderName: string, itemId: string) => void;
  onUpdateVendors?: (vendors: Vendor[]) => void;
  onCreateReel?: () => void;
  onRefresh?: () => void | Promise<void>;
}

const WeddingDetail = ({ wedding, onBack, onReview, onDeleteItem, onUpdateVendors, onCreateReel, onRefresh }: WeddingDetailProps) => {
  const [openFolder, setOpenFolder] = useState<MediaFolder | null>(null);
  const [viewingItem, setViewingItem] = useState<MediaItem | null>(null);

  // Keep openFolder in sync with wedding data after deletions
  const currentFolder = openFolder
    ? wedding.folders.find((f) => f.name === openFolder.name) || openFolder
    : null;

  const handleDelete = (itemId: string) => {
    if (currentFolder && onDeleteItem) {
      onDeleteItem(currentFolder.name, itemId);
    }
  };

  if (currentFolder && openFolder) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence>
          {viewingItem && (
            <MediaViewer
              item={viewingItem}
              onClose={() => setViewingItem(null)}
              onDelete={handleDelete}
            />
          )}
        </AnimatePresence>

        <button onClick={() => setOpenFolder(null)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to {wedding.name}
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-heading font-semibold text-foreground">{currentFolder.name}</h1>
          <p className="text-muted-foreground font-body text-sm mt-1">{currentFolder.items.length} items</p>
        </div>

        {currentFolder.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground font-body">
            <FolderOpen className="w-12 h-12 mb-3 opacity-40" />
            <p>No items in this folder yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {currentFolder.items.map((item, i) => {
              const hasRealThumb = item.thumbnail && item.thumbnail !== '/placeholder.svg';
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.02, 0.5) }}
                  onClick={() => setViewingItem(item)}
                  className="aspect-square rounded-lg bg-accent border border-border relative overflow-hidden hover:border-rose-gold-light/60 transition-colors cursor-pointer"
                >
                  {hasRealThumb ? (
                    item.type === 'video' ? (
                      <video src={item.thumbnail} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {item.type === 'video' ? (
                        <Film className="w-5 h-5 text-rose-gold/50" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                      )}
                    </div>
                  )}
                  {item.type === 'video' && (
                    <span className="absolute bottom-1 right-1 text-[10px] bg-foreground/70 text-background px-1 rounded font-body">
                      VID
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-heading font-semibold text-foreground">{wedding.name}</h1>
            <BackgroundUploadIndicator weddingId={wedding.id} />
          </div>
          <p className="text-muted-foreground font-body mt-1">
            {new Date(wedding.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {' · '}{wedding.mediaCount} files
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onCreateReel}
            variant="outline"
            className="border-rose-gold text-rose-gold hover:bg-accent font-body"
          >
            <Clapperboard className="w-4 h-4 mr-2" />
            Create Reel
          </Button>
          {wedding.flaggedItems.length > 0 && (
            <Button
              onClick={onReview}
              variant="outline"
              className="border-rose-gold text-rose-gold hover:bg-accent font-body"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Review {wedding.flaggedItems.length} Flagged Item{wedding.flaggedItems.length > 1 ? 's' : ''}
            </Button>
          )}
        </div>
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
              onClick={() => setOpenFolder(folder)}
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
                  {folder.items.slice(0, 8).map((item) => {
                    const hasRealThumb = item.thumbnail && item.thumbnail !== '/placeholder.svg';
                    return (
                      <div key={item.id} className="aspect-square rounded bg-accent overflow-hidden flex items-center justify-center">
                        {hasRealThumb ? (
                          <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-3 h-3 text-muted-foreground/40" />
                        )}
                      </div>
                    );
                  })}
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

      {/* Vendors Section */}
      <VendorSection
        vendors={wedding.vendors || []}
        onUpdate={(vendors) => onUpdateVendors?.(vendors)}
      />
    </div>
  );
};

export default WeddingDetail;
