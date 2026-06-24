import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Sparkles, Heart, Camera, PartyPopper, Gem, FolderOpen, Inbox, AlertTriangle, Image as ImageIcon, Film, Clapperboard, Download, Loader2, ArrowRightLeft, Plus, Upload, Share2, Trash2, CheckSquare, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Wedding, MediaFolder, MediaItem, Vendor } from '@/lib/types';
import MediaViewer from '@/components/MediaViewer';
import ClientGalleryDialog from '@/components/ClientGalleryDialog';
import VendorSection from '@/components/VendorSection';
import BackgroundUploadIndicator from '@/components/BackgroundUploadIndicator';
import SortFootageButton from '@/components/SortFootageButton';
import { supabase } from '@/integrations/supabase/client';
import { updateMediaItemFolder, createCustomFolder } from '@/lib/supabase-helpers';
import { toast } from '@/hooks/use-toast';

const PRESET_FOLDERS = ['Getting Ready', 'Ceremony', 'Portraits', 'Reception', 'Details', 'Miscellaneous', 'Unsorted'];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, Heart, Camera, PartyPopper, Gem, FolderOpen, Inbox,
};

interface WeddingDetailProps {
  wedding: Wedding;
  onBack: () => void;
  onReview: () => void;
  onDeleteItem?: (folderName: string, itemId: string) => void;
  onDeleteItems?: (itemIds: string[]) => void | Promise<void>;
  onUpdateVendors?: (vendors: Vendor[]) => void;
  onCreateReel?: () => void;
  onRefresh?: () => void | Promise<void>;
  onAddMore?: () => void;
}

const WeddingDetail = ({ wedding, onBack, onReview, onDeleteItem, onDeleteItems, onUpdateVendors, onCreateReel, onRefresh, onAddMore }: WeddingDetailProps) => {
  const [openFolder, setOpenFolder] = useState<MediaFolder | null>(null);
  const [viewingItem, setViewingItem] = useState<MediaItem | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [addingFolder, setAddingFolder] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // All completed photos across folders — the candidate set for the client gallery.
  const galleryPhotos = wedding.folders
    .flatMap((f) => f.items)
    .filter((it) => it.type === 'photo' && it.uploadStatus !== 'pending');

  // Build the full list of folder names for move-to menu
  const allFolderNames = wedding.folders.map((f) => f.name);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast({ title: 'Please sign in to export', variant: 'destructive' });
        return;
      }
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/zip-export?weddingId=${encodeURIComponent(wedding.id)}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Export failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${wedding.name.replace(/[\\/:*?"<>|]+/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast({ title: 'Export ready', description: 'Your ZIP has been downloaded.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      toast({ title: 'Export failed', description: msg, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  // Keep openFolder in sync with wedding data after deletions
  const currentFolder = openFolder
    ? wedding.folders.find((f) => f.name === openFolder.name) || openFolder
    : null;

  const handleDelete = (itemId: string) => {
    if (currentFolder && onDeleteItem) {
      onDeleteItem(currentFolder.name, itemId);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !onDeleteItems) return;
    setDeleting(true);
    try {
      await onDeleteItems(ids);
      toast({ title: `Deleted ${ids.length} item${ids.length > 1 ? 's' : ''}` });
      setConfirmDelete(false);
      exitSelectMode();
    } catch (e) {
      toast({ title: 'Delete failed', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleMove = async (itemId: string, targetFolder: string) => {
    try {
      await updateMediaItemFolder(itemId, targetFolder);
      toast({ title: `Moved to ${targetFolder}` });
      await onRefresh?.();
    } catch (e) {
      toast({ title: 'Move failed', variant: 'destructive' });
    }
  };

  const handleAddFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    if (allFolderNames.includes(trimmed)) {
      toast({ title: 'Folder already exists', variant: 'destructive' });
      return;
    }
    setAddingFolder(true);
    try {
      await createCustomFolder(wedding.id, trimmed);
      toast({ title: `"${trimmed}" folder created` });
      setNewFolderName('');
      setShowAddFolder(false);
      await onRefresh?.();
    } catch (e) {
      toast({ title: 'Could not create folder', variant: 'destructive' });
    } finally {
      setAddingFolder(false);
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

        <Dialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading">
                Delete {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''}?
              </DialogTitle>
            </DialogHeader>
            <p className="font-body text-sm text-muted-foreground">
              This permanently removes the selected {selectedIds.size > 1 ? 'files' : 'file'} and frees up their storage. This can't be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting} className="font-body">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting} className="font-body">
                {deleting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
                {deleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <button onClick={() => { exitSelectMode(); setOpenFolder(null); }} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to {wedding.name}
        </button>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-heading font-semibold text-foreground">{currentFolder.name}</h1>
            <p className="text-muted-foreground font-body text-sm mt-1">
              {selectMode ? `${selectedIds.size} selected` : `${currentFolder.items.length} items`}
            </p>
          </div>
          {currentFolder.items.length > 0 && onDeleteItems && (
            <div className="flex items-center gap-2 shrink-0">
              {selectMode ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelectedIds(
                        selectedIds.size === currentFolder.items.length
                          ? new Set()
                          : new Set(currentFolder.items.map((it) => it.id)),
                      )
                    }
                    className="font-body text-sm"
                  >
                    {selectedIds.size === currentFolder.items.length ? 'Deselect all' : 'Select all'}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={selectedIds.size === 0}
                    onClick={() => setConfirmDelete(true)}
                    className="font-body"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                  </Button>
                  <Button variant="outline" size="sm" onClick={exitSelectMode} className="font-body">
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectMode(true)}
                  className="border-rose-gold text-rose-gold hover:bg-accent font-body"
                >
                  <CheckSquare className="w-4 h-4 mr-1.5" />
                  Select
                </Button>
              )}
            </div>
          )}
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
              const otherFolders = allFolderNames.filter((f) => f !== currentFolder.name);
              const isSelected = selectedIds.has(item.id);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.02, 0.5) }}
                  className={`aspect-square rounded-lg bg-accent border relative overflow-hidden transition-colors cursor-pointer group ${
                    isSelected ? 'border-rose-gold ring-2 ring-rose-gold' : 'border-border hover:border-rose-gold-light/60'
                  }`}
                >
                  {/* Thumbnail area — tap to view, or toggle selection in select mode */}
                  <div className="w-full h-full" onClick={() => (selectMode ? toggleSelected(item.id) : setViewingItem(item))}>
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
                  </div>

                  {selectMode ? (
                    /* Selection checkbox — overlays whole tile while selecting */
                    <div
                      onClick={() => toggleSelected(item.id)}
                      className={`absolute inset-0 z-10 flex items-start justify-end p-1.5 ${isSelected ? 'bg-rose-gold/20' : ''}`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                          isSelected ? 'bg-rose-gold border-rose-gold' : 'bg-foreground/30 border-background/80'
                        }`}
                      >
                        {isSelected && <Check className="w-4 h-4 text-background" />}
                      </span>
                    </div>
                  ) : (
                    /* Move button — visible on hover / always visible on mobile */
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-1 left-1 w-7 h-7 rounded-full bg-foreground/70 flex items-center justify-center opacity-0 group-hover:opacity-100 sm:opacity-0 active:opacity-100 transition-opacity z-10"
                          aria-label="Move to folder"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-background" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-[160px]">
                        <p className="px-2 py-1.5 text-xs font-body text-muted-foreground">Move to…</p>
                        {otherFolders.map((folder) => (
                          <DropdownMenuItem
                            key={folder}
                            onClick={() => handleMove(item.id, folder)}
                            className="font-body text-sm cursor-pointer"
                          >
                            {folder}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {item.type === 'video' && (
                    <span className="absolute bottom-1 right-1 text-[10px] bg-foreground/70 text-background px-1 rounded font-body z-10">
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
            onClick={onAddMore}
            variant="outline"
            className="border-rose-gold text-rose-gold hover:bg-accent font-body"
          >
            <Upload className="w-4 h-4 mr-2" />
            Add More
          </Button>
          <SortFootageButton
            weddingId={wedding.id}
            unsortedCount={wedding.folders.find((f) => f.name === 'Unsorted')?.items.length || 0}
            folders={wedding.folders.filter((f) => f.name !== 'Unsorted').map((f) => f.name)}
            projectType={wedding.type}
            onSorted={() => onRefresh?.()}
          />
          <Button
            onClick={onCreateReel}
            variant="outline"
            className="border-rose-gold text-rose-gold hover:bg-accent font-body"
          >
            <Clapperboard className="w-4 h-4 mr-2" />
            Create Reel
          </Button>
          <Button
            onClick={() => setShowGallery(true)}
            variant="outline"
            className="border-rose-gold text-rose-gold hover:bg-accent font-body"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Client Gallery
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting || wedding.mediaCount === 0}
            variant="outline"
            className="border-rose-gold text-rose-gold hover:bg-accent font-body"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {exporting ? 'Preparing ZIP…' : 'Export ZIP'}
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
        {/* Add Folder card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: wedding.folders.length * 0.08 }}
            onClick={() => setShowAddFolder(true)}
            className="bg-card rounded-xl border-2 border-dashed border-border p-6 hover:border-rose-gold-light/40 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center min-h-[140px]"
          >
            <Plus className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="font-body text-sm text-muted-foreground">Add Folder</p>
          </motion.div>
        </div>

      {/* Add Folder Dialog */}
      <Dialog open={showAddFolder} onOpenChange={setShowAddFolder}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Add Custom Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="e.g. First Look, Speeches, Getting Ready B-Roll"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="font-body"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFolderName.trim()) handleAddFolder();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddFolder(false)} className="font-body">Cancel</Button>
            <Button
              onClick={handleAddFolder}
              disabled={!newFolderName.trim() || addingFolder}
              className="gradient-rose text-primary-foreground font-body"
            >
              {addingFolder ? 'Adding…' : 'Add Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Gallery Dialog */}
      <ClientGalleryDialog
        weddingId={wedding.id}
        weddingName={wedding.name}
        photos={galleryPhotos}
        open={showGallery}
        onOpenChange={setShowGallery}
      />

      {/* Vendors Section */}
      <VendorSection
        vendors={wedding.vendors || []}
        onUpdate={(vendors) => onUpdateVendors?.(vendors)}
      />
    </div>
  );
};

export default WeddingDetail;
