import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Trash2, Check, Video, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MediaItem } from '@/lib/types';

interface ReviewClipsProps {
  clips: MediaItem[];
  weddingName: string;
  onBack: () => void;
  onComplete: (kept: string[], deleted: string[]) => void;
}

const ReviewClips = ({ clips, weddingName, onBack, onComplete }: ReviewClipsProps) => {
  const [decisions, setDecisions] = useState<Record<string, 'keep' | 'delete'>>({});

  const handleDecision = (id: string, action: 'keep' | 'delete') => {
    setDecisions((prev) => ({ ...prev, [id]: action }));
  };

  const allDecided = Object.keys(decisions).length === clips.length;

  const handleComplete = () => {
    const kept = Object.entries(decisions).filter(([, v]) => v === 'keep').map(([k]) => k);
    const deleted = Object.entries(decisions).filter(([, v]) => v === 'delete').map(([k]) => k);
    onComplete(kept, deleted);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to {weddingName}
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-heading font-semibold text-foreground">Review Short Clips</h1>
        <p className="text-muted-foreground font-body mt-1">
          These video clips are under 3 seconds. Review and decide to keep or delete each one.
        </p>
      </div>

      <div className="space-y-4">
        <AnimatePresence>
          {clips.map((clip, i) => {
            const decision = decisions[clip.id];
            return (
              <motion.div
                key={clip.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`bg-card rounded-xl border p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 transition-colors ${
                  decision === 'delete'
                    ? 'border-destructive/30 bg-destructive/5'
                    : decision === 'keep'
                    ? 'border-rose-gold/30 bg-accent/50'
                    : 'border-border'
                }`}
              >
                <div className="w-24 h-16 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  <Video className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm font-medium text-foreground truncate">
                    Clip from {clip.folder}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-body">{clip.duration?.toFixed(1)}s</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant={decision === 'keep' ? 'default' : 'outline'}
                    onClick={() => handleDecision(clip.id, 'keep')}
                    className={decision === 'keep' ? 'gradient-rose text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Keep
                  </Button>
                  <Button
                    size="sm"
                    variant={decision === 'delete' ? 'destructive' : 'outline'}
                    onClick={() => handleDecision(clip.id, 'delete')}
                    className={decision !== 'delete' ? 'border-border text-muted-foreground hover:text-destructive' : ''}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {clips.length > 0 && (
        <div className="mt-8 text-center">
          <Button
            onClick={handleComplete}
            disabled={!allDecided}
            className="gradient-rose text-primary-foreground font-body font-medium hover:opacity-90 disabled:opacity-50"
          >
            Confirm Decisions
          </Button>
          {!allDecided && (
            <p className="text-xs text-muted-foreground font-body mt-2">
              Review all {clips.length} clips to continue
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ReviewClips;
