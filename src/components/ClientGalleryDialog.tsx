import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { MediaItem } from '@/lib/types';
import {
  Gallery,
  getOrCreateGallery,
  fetchGalleryExclusions,
  setGalleryExclusions,
  setGalleryEnabled,
  galleryShareUrl,
} from '@/lib/gallery';
import { toast } from '@/hooks/use-toast';

interface ClientGalleryDialogProps {
  weddingId: string;
  weddingName: string;
  /** All completed photos for the wedding (videos excluded). */
  photos: MediaItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ClientGalleryDialog = ({ weddingId, weddingName, photos, open, onOpenChange }: ClientGalleryDialogProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [enabled, setEnabled] = useState(true);
  // Ids of photos INCLUDED in the gallery (everything starts included).
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const g = await getOrCreateGallery(weddingId, weddingName);
        const excluded = await fetchGalleryExclusions(g.id);
        if (cancelled) return;
        setGallery(g);
        setEnabled(g.isEnabled);
        setIncluded(new Set(photos.map((p) => p.id).filter((id) => !excluded.has(id))));
      } catch (e) {
        console.error('Failed to load gallery:', e);
        toast({ title: 'Could not load gallery', description: 'Please try again.', variant: 'destructive' });
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weddingId]);

  const shareUrl = gallery ? galleryShareUrl(gallery.shareToken) : '';
  const includedCount = included.size;

  const togglePhoto = (id: string) => {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setIncluded(new Set(photos.map((p) => p.id)));
  const selectNone = () => setIncluded(new Set());

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy the link manually.', variant: 'destructive' });
    }
  };

  const handleToggleEnabled = async (next: boolean) => {
    if (!gallery) return;
    setEnabled(next);
    try {
      await setGalleryEnabled(gallery.id, next);
    } catch (e) {
      setEnabled(!next); // revert
      toast({ title: 'Could not update sharing', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!gallery) return;
    setSaving(true);
    try {
      const excluded = photos.map((p) => p.id).filter((id) => !included.has(id));
      await setGalleryExclusions(gallery.id, excluded);
      toast({ title: 'Gallery updated', description: `${includedCount} photo${includedCount === 1 ? '' : 's'} shared.` });
      onOpenChange(false);
    } catch (e) {
      console.error('Failed to save gallery:', e);
      toast({ title: 'Could not save selection', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Share2 className="w-5 h-5 text-rose-gold" />
            Client Gallery
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-rose-gold animate-spin" />
          </div>
        ) : (
          <>
            {/* Share link + enable toggle */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} className="font-body text-sm bg-accent/40" />
                <Button type="button" variant="outline" size="icon" onClick={handleCopy} aria-label="Copy link" className="shrink-0 border-rose-gold text-rose-gold hover:bg-accent">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => window.open(shareUrl, '_blank', 'noopener')} aria-label="Open gallery" className="shrink-0 border-rose-gold text-rose-gold hover:bg-accent">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
                <div>
                  <p className="text-sm font-body font-medium text-foreground">Sharing {enabled ? 'on' : 'off'}</p>
                  <p className="text-xs font-body text-muted-foreground">
                    {enabled ? 'Anyone with the link can view the gallery.' : 'The link is disabled — clients see nothing.'}
                  </p>
                </div>
                <Switch checked={enabled} onCheckedChange={handleToggleEnabled} />
              </div>
            </div>

            {/* Photo selection */}
            <div className="flex items-center justify-between mt-1">
              <p className="text-sm font-body text-muted-foreground">
                {includedCount} of {photos.length} photo{photos.length === 1 ? '' : 's'} shared
              </p>
              <div className="flex gap-3 text-xs font-body">
                <button onClick={selectAll} className="text-rose-gold hover:underline">Select all</button>
                <button onClick={selectNone} className="text-muted-foreground hover:underline">Clear</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {photos.length === 0 ? (
                <p className="text-sm font-body text-muted-foreground text-center py-10">
                  No photos uploaded yet. Add photos to this wedding first.
                </p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {photos.map((p) => {
                    const isIn = included.has(p.id);
                    const hasThumb = p.thumbnail && p.thumbnail !== '/placeholder.svg';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePhoto(p.id)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          isIn ? 'border-rose-gold' : 'border-transparent opacity-50'
                        }`}
                      >
                        {hasThumb ? (
                          <img src={p.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-accent" />
                        )}
                        <span
                          className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center ${
                            isIn ? 'bg-rose-gold text-white' : 'bg-foreground/40 text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="mt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="font-body">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gradient-rose text-primary-foreground font-body">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save gallery
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ClientGalleryDialog;
