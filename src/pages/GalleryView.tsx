import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Download, Loader2, X, Heart, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchGalleryByToken, GalleryPhoto, PublicGallery } from '@/lib/gallery';
import { toast } from '@/hooks/use-toast';

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'gallery';
}

function extFromUrl(url: string): string {
  const m = url.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1] : 'jpg';
}

// Fetch a photo and trigger a browser download. The storage bucket is public
// and serves permissive CORS headers, so fetching the blob (required to force a
// download for cross-origin URLs) works without auth.
async function downloadPhoto(photo: GalleryPhoto, index: number, baseName: string): Promise<void> {
  const res = await fetch(photo.url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `${sanitize(baseName)}-${String(index + 1).padStart(3, '0')}.${extFromUrl(photo.url)}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

const GalleryView = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [gallery, setGallery] = useState<PublicGallery | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [lightbox, setLightbox] = useState<GalleryPhoto | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = token ? await fetchGalleryByToken(token) : null;
        if (!cancelled) setGallery(data);
      } catch (e) {
        console.error('Failed to load gallery:', e);
        if (!cancelled) setGallery(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const photos = gallery?.photos ?? [];
  const baseName = gallery?.weddingName ?? 'gallery';

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = photos.length > 0 && selected.size === photos.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(photos.map((p) => p.id)));

  const runDownload = async (items: GalleryPhoto[]) => {
    if (downloading || items.length === 0) return;
    setDownloading(true);
    let ok = 0;
    try {
      for (let i = 0; i < items.length; i++) {
        const idx = photos.findIndex((p) => p.id === items[i].id);
        try {
          await downloadPhoto(items[i], idx, baseName);
          ok += 1;
        } catch (e) {
          console.error('Photo download failed:', e);
        }
        // Small gap so the browser registers each save separately.
        if (i < items.length - 1) await new Promise((r) => setTimeout(r, 350));
      }
      toast({
        title: ok === items.length ? 'Download started' : `Downloaded ${ok} of ${items.length}`,
        description: ok === items.length ? `${ok} photo${ok === 1 ? '' : 's'} saved.` : 'Some photos could not be downloaded.',
        variant: ok === 0 ? 'destructive' : undefined,
      });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-rose-gold animate-spin" />
      </div>
    );
  }

  // Unknown token, disabled gallery, or no photos shared yet.
  if (!gallery) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <ImageOff className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <h1 className="font-heading text-2xl text-foreground mb-2">Gallery unavailable</h1>
        <p className="font-body text-muted-foreground max-w-sm">
          This gallery link is invalid or is no longer being shared. Please check with your photographer.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-2 text-rose-gold mb-3">
            <Heart className="w-4 h-4" />
            <span className="font-heading text-sm tracking-wide">Aisle AI</span>
          </div>
          <h1 className="font-heading text-3xl text-foreground">{gallery.weddingName}</h1>
          <p className="font-body text-muted-foreground mt-1">
            {gallery.weddingDate
              ? new Date(gallery.weddingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : null}
            {' · '}
            {photos.length} photo{photos.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      {/* Toolbar */}
      {photos.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex items-center justify-between">
          <button onClick={toggleAll} className="font-body text-sm text-rose-gold hover:underline">
            {allSelected ? 'Clear selection' : 'Select all'}
          </button>
          <p className="font-body text-sm text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : 'Tap photos to select'}
          </p>
        </div>
      )}

      {/* Grid */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        {photos.length === 0 ? (
          <p className="font-body text-muted-foreground text-center py-20">
            No photos have been shared in this gallery yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
            {photos.map((photo) => {
              const isSel = selected.has(photo.id);
              return (
                <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-accent group">
                  <img
                    src={photo.thumbnail}
                    alt=""
                    loading="lazy"
                    onClick={() => setLightbox(photo)}
                    className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  {/* Selection toggle */}
                  <button
                    onClick={() => toggle(photo.id)}
                    aria-label={isSel ? 'Deselect photo' : 'Select photo'}
                    className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                      isSel ? 'bg-rose-gold text-white' : 'bg-foreground/40 text-white/80 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  {/* Quick single download */}
                  <button
                    onClick={() => runDownload([photo])}
                    aria-label="Download photo"
                    className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-foreground/55 hover:bg-foreground/75 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Sticky download bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
              <p className="font-body text-sm text-foreground">
                {selected.size} photo{selected.size === 1 ? '' : 's'} selected
              </p>
              <Button
                onClick={() => runDownload(photos.filter((p) => selected.has(p.id)))}
                disabled={downloading}
                className="gradient-rose text-primary-foreground font-body"
              >
                {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                {downloading ? 'Downloading…' : 'Download selected'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          >
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <img src={lightbox.url} alt="" onClick={(e) => e.stopPropagation()} className="max-w-full max-h-[88vh] object-contain rounded" />
            <Button
              onClick={(e) => {
                e.stopPropagation();
                runDownload([lightbox]);
              }}
              disabled={downloading}
              className="absolute bottom-6 gradient-rose text-primary-foreground font-body"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GalleryView;
