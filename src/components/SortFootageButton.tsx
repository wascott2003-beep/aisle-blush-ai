import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { fetchUnsortedItems, updateMediaItemFolder } from '@/lib/supabase-helpers';
import { toast } from '@/hooks/use-toast';

interface SortFootageButtonProps {
  weddingId: string;
  unsortedCount: number;
  onSorted: () => void;
}

const BATCH_SIZE = 8;

const SortFootageButton = ({ weddingId, unsortedCount, onSorted }: SortFootageButtonProps) => {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);

  if (unsortedCount === 0 && !open) return null;

  const handleSort = async () => {
    setRunning(true);
    setDone(false);
    setProcessed(0);
    setCurrentFolder(null);

    try {
      const items = await fetchUnsortedItems(weddingId);
      setTotal(items.length);
      if (items.length === 0) {
        setRunning(false);
        setDone(true);
        return;
      }

      let count = 0;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        try {
          const { data, error } = await supabase.functions.invoke('sort-footage', {
            body: { items: batch },
          });
          if (error) throw error;
          const results: Array<{ id: string; folder: string }> = data?.results || [];

          for (const r of results) {
            try {
              await updateMediaItemFolder(r.id, r.folder);
              setCurrentFolder(r.folder);
            } catch (e) {
              console.warn('Failed to update folder for', r.id, e);
            }
            count += 1;
            setProcessed(count);
          }
        } catch (e) {
          console.error('Batch sort failed:', e);
          count += batch.length;
          setProcessed(count);
        }
      }

      setDone(true);
      onSorted();
      toast({ title: 'Sorting complete', description: `${items.length} files sorted into folders.` });
    } catch (err) {
      console.error('Sort failed:', err);
      toast({
        title: 'Sorting failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          if (!running && !done) handleSort();
        }}
        variant="outline"
        className="border-rose-gold text-rose-gold hover:bg-accent font-body"
      >
        <Sparkles className="w-4 h-4 mr-2" />
        Sort My Footage
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => {
              if (!running) {
                setOpen(false);
                setDone(false);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl border border-border p-8 max-w-md w-full text-center space-y-5 shadow-xl"
            >
              {!done ? (
                <>
                  <div className="relative w-16 h-16 mx-auto">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                      className="absolute inset-0 rounded-full border-2 border-rose-gold/20"
                    />
                    <Sparkles className="w-8 h-8 text-rose-gold absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-heading text-xl text-foreground">Sorting your footage</h3>
                    <p className="text-sm text-muted-foreground font-body mt-1">
                      Analyzing {total || unsortedCount} files and placing each into the right folder…
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Progress value={percent} className="h-2 bg-accent [&>div]:bg-rose-gold" />
                    <div className="flex items-center justify-between text-xs font-body text-muted-foreground">
                      <span>
                        {processed} of {total || unsortedCount}
                      </span>
                      <span>{percent}%</span>
                    </div>
                  </div>
                  {currentFolder && (
                    <p className="text-xs text-muted-foreground font-body flex items-center justify-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Latest: {currentFolder}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-14 h-14 text-rose-gold mx-auto" />
                  <div>
                    <h3 className="font-heading text-xl text-foreground">All sorted!</h3>
                    <p className="text-sm text-muted-foreground font-body mt-1">
                      {total} {total === 1 ? 'file has' : 'files have'} been organized into folders.
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setOpen(false);
                      setDone(false);
                    }}
                    className="gradient-rose text-primary-foreground font-body"
                  >
                    Done
                  </Button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SortFootageButton;
