import { useEffect, useState } from 'react';
import { CloudUpload, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { subscribeUploadQueue } from '@/lib/upload-queue';

interface BackgroundUploadIndicatorProps {
  weddingId: string;
}

const BackgroundUploadIndicator = ({ weddingId }: BackgroundUploadIndicatorProps) => {
  const [pending, setPending] = useState(0);
  const [showDone, setShowDone] = useState(false);
  const [prevPending, setPrevPending] = useState(0);

  useEffect(() => {
    return subscribeUploadQueue((s) => {
      const count = s.pendingByWedding[weddingId] || 0;
      setPending(count);
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

  return (
    <AnimatePresence>
      {pending > 0 && (
        <motion.div
          key="uploading"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center gap-2 rounded-full bg-card border border-border px-3 py-1.5 text-xs font-body text-muted-foreground"
        >
          <CloudUpload className="w-3.5 h-3.5 text-rose-gold animate-pulse" />
          <span>Saving {pending} file{pending === 1 ? '' : 's'} at full quality…</span>
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
