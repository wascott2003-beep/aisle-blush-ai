import { useEffect, useState } from 'react';
import { CloudUpload, CheckCircle2, X, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  cancelUploadsForWedding,
  retryCanceledForWedding,
  subscribeUploadQueue,
} from '@/lib/upload-queue';
import { toast } from '@/hooks/use-toast';

interface BackgroundUploadIndicatorProps {
  weddingId: string;
}

const BackgroundUploadIndicator = ({ weddingId }: BackgroundUploadIndicatorProps) => {
  const [pending, setPending] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [canceled, setCanceled] = useState(0);
  const [showDone, setShowDone] = useState(false);
  const [prevPending, setPrevPending] = useState(0);

  useEffect(() => {
    return subscribeUploadQueue((s) => {
      setPending(s.pendingByWedding[weddingId] || 0);
      setCompleted(s.completed);
      setTotal(s.total);
      setCanceled(s.canceledByWedding[weddingId] || 0);
    });
  }, [weddingId]);

  useEffect(() => {
    if (prevPending > 0 && pending === 0) {
      setShowDone(true);
      const t = setTimeout(() => setShowDone(false), 4000);
      return () => clearTimeout(t);
    }
    setPrevPending(pending);
  }, [pending, prevPending]);

  const handleCancel = () => {
    const removed = cancelUploadsForWedding(weddingId);
    if (removed > 0) {
      toast({
        title: 'Uploads canceled',
        description: `${removed} pending file${removed === 1 ? '' : 's'} canceled. Any file already uploading will finish.`,
      });
    }
  };

  // Prefer "X of Y" when we know the batch size, otherwise fall back to count.
  const progressLabel =
    total > 0
      ? `Uploading ${Math.min(completed + 1, total)} of ${total} files`
      : `Saving ${pending} file${pending === 1 ? '' : 's'} at full quality…`;

  return (
    <AnimatePresence>
      {pending > 0 && (
        <motion.div
          key="uploading"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center gap-2 rounded-full bg-card border border-border pl-3 pr-1 py-1 text-xs font-body text-muted-foreground"
        >
          <CloudUpload className="w-3.5 h-3.5 text-rose-gold animate-pulse" />
          <span>{progressLabel}</span>
          <button
            onClick={handleCancel}
            aria-label="Cancel uploads"
            className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </motion.div>
      )}
      {showDone && pending === 0 && (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center gap-2 rounded-full bg-card border border-border px-3 py-1.5 text-xs font-body text-muted-foreground"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-rose-gold" />
          <span>All files saved at full quality.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BackgroundUploadIndicator;
