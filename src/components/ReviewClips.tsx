import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Trash2, Check, Video, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MediaItem } from '@/lib/types';

interface ReviewClipsProps {
  clips: MediaItem[];
  weddingName: string;
  onBack: () => void;
  onComplete: (kept: string[], deleted: string[]) => void;
}

const ReviewClips = ({ clips, weddingName, onBack, onComplete }: ReviewClipsProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [kept, setKept] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const totalClips = clips.length;
  const currentClip = clips[currentIndex];

  const advance = () => {
    if (currentIndex + 1 >= totalClips) {
      setDone(true);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleKeep = () => {
    setKept((prev) => [...prev, currentClip.id]);
    advance();
  };

  const handleDelete = () => {
    setDeleted((prev) => [...prev, currentClip.id]);
    advance();
  };

  if (done) {
    // Auto-return after a moment
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', duration: 0.5 }}>
          <CheckCircle2 className="w-16 h-16 text-rose-gold mx-auto mb-4" />
          <h2 className="text-2xl font-heading font-semibold text-foreground mb-2">All clips reviewed</h2>
          <p className="text-muted-foreground font-body mb-1">
            {kept.length} kept · {deleted.length} deleted
          </p>
          <Button
            onClick={() => onComplete(kept, deleted)}
            className="gradient-rose text-primary-foreground font-body font-medium mt-6"
          >
            Return to {weddingName}
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to {weddingName}
      </button>

      <div className="mb-6 text-center">
        <h1 className="text-2xl font-heading font-semibold text-foreground">Review Short Clips</h1>
        <p className="text-muted-foreground font-body text-sm mt-1">
          Clip {currentIndex + 1} of {totalClips} · Under 3 seconds
        </p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentClip.id}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25 }}
          className="bg-card rounded-2xl border border-border p-6 flex flex-col items-center"
        >
          {/* Video placeholder */}
          <div className="w-full aspect-video rounded-xl bg-accent flex items-center justify-center mb-5">
            <Video className="w-12 h-12 text-muted-foreground/30" />
          </div>

          {/* Info */}
          <p className="font-body text-sm font-medium text-foreground mb-1">
            Clip from {currentClip.folder}
          </p>
          <div className="flex items-center gap-1.5 mb-6">
            <Clock className="w-3.5 h-3.5 text-rose-gold" />
            <span className="text-rose-gold font-body font-semibold text-sm">
              {currentClip.duration?.toFixed(1)}s
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-4 w-full">
            <Button
              onClick={handleDelete}
              variant="destructive"
              className="flex-1 h-12 text-base font-body font-medium"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <Button
              onClick={handleKeep}
              className="flex-1 h-12 text-base font-body font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="w-4 h-4 mr-2" />
              Keep
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Progress dots */}
      <div className="flex justify-center gap-2 mt-6">
        {clips.map((clip, i) => (
          <div
            key={clip.id}
            className={`w-2 h-2 rounded-full transition-colors ${
              i < currentIndex
                ? deleted.includes(clip.id)
                  ? 'bg-destructive'
                  : 'bg-emerald-500'
                : i === currentIndex
                ? 'bg-rose-gold'
                : 'bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default ReviewClips;
