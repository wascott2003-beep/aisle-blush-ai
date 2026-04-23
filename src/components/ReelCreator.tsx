import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Film, Play, Download, Share2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Mood = 'Romantic' | 'Fun & Upbeat' | 'Cinematic' | 'Emotional';
type ReelLength = 15 | 30 | 60;
type Step = 'options' | 'generating' | 'preview';

const moods: { label: Mood; emoji: string; desc: string }[] = [
  { label: 'Romantic', emoji: '💕', desc: 'Soft, dreamy transitions' },
  { label: 'Fun & Upbeat', emoji: '🎉', desc: 'Energetic, fast-paced cuts' },
  { label: 'Cinematic', emoji: '🎬', desc: 'Dramatic, film-like feel' },
  { label: 'Emotional', emoji: '🥹', desc: 'Slow, heartfelt moments' },
];

const lengths: { value: ReelLength; label: string }[] = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];

interface ReelCreatorProps {
  weddingName: string;
  onBack: () => void;
}

const ReelCreator = ({ weddingName, onBack }: ReelCreatorProps) => {
  const [step, setStep] = useState<Step>('options');
  const [mood, setMood] = useState<Mood | null>(null);
  const [length, setLength] = useState<ReelLength>(30);
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (step !== 'generating') return;
    setProgress(0);
    const duration = 4000;
    const interval = 50;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      const p = Math.min((elapsed / duration) * 100, 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(timer);
        setTimeout(() => setStep('preview'), 400);
      }
    }, interval);
    return () => clearInterval(timer);
  }, [step]);

  const handleGenerate = () => {
    if (!mood) return;
    setStep('generating');
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to {weddingName}
      </button>

      <AnimatePresence mode="wait">
        {/* Step 1: Options */}
        {step === 'options' && (
          <motion.div key="options" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-rose-gold/10 flex items-center justify-center mx-auto mb-4">
                <Film className="w-7 h-7 text-rose-gold" />
              </div>
              <h1 className="text-2xl font-heading font-semibold text-foreground">Create Reel</h1>
              <p className="text-muted-foreground font-body text-sm mt-1">Choose a mood and length for your highlight reel</p>
            </div>

            {/* Mood Selection */}
            <div className="mb-8">
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-3 block">Mood</label>
              <div className="grid grid-cols-2 gap-3">
                {moods.map((m) => (
                  <button
                    key={m.label}
                    onClick={() => setMood(m.label)}
                    className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                      mood === m.label
                        ? 'border-rose-gold bg-rose-gold/10 shadow-sm'
                        : 'border-border bg-card hover:border-rose-gold-light/40'
                    }`}
                  >
                    <span className="text-xl mb-1 block">{m.emoji}</span>
                    <span className="font-heading font-medium text-foreground text-sm block">{m.label}</span>
                    <span className="font-body text-[11px] text-muted-foreground">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Length Selection */}
            <div className="mb-8">
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-3 block">Length</label>
              <div className="flex gap-3">
                {lengths.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setLength(l.value)}
                    className={`flex-1 py-3 rounded-xl border font-heading font-medium text-sm transition-all duration-200 ${
                      length === l.value
                        ? 'border-rose-gold bg-rose-gold/10 text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-rose-gold-light/40'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!mood}
              className="w-full bg-rose-gold hover:bg-rose-gold/90 text-white font-body h-12 text-base"
            >
              <Film className="w-4 h-4 mr-2" />
              Generate Reel
            </Button>
          </motion.div>
        )}

        {/* Step 2: Generating */}
        {step === 'generating' && (
          <motion.div key="generating" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center justify-center py-20">
            {/* Animated rings */}
            <div className="relative w-28 h-28 mb-8">
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-rose-gold/30"
                animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute inset-2 rounded-full border-2 border-rose-gold/40"
                animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0.1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
              />
              <motion.div
                className="absolute inset-4 rounded-full border-2 border-rose-gold/50"
                animate={{ scale: [1, 1.2, 1], opacity: [0.7, 0.2, 0.7] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Film className="w-8 h-8 text-rose-gold" />
              </div>
            </div>

            <h2 className="text-xl font-heading font-semibold text-foreground mb-2">Generating your reel…</h2>
            <p className="text-muted-foreground font-body text-sm mb-6">
              {mood} · {length}s
            </p>

            {/* Progress bar */}
            <div className="w-full max-w-xs">
              <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-rose-gold rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground font-body text-center mt-2">{Math.round(progress)}%</p>
            </div>
          </motion.div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && (
          <motion.div key="preview" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-heading font-semibold text-foreground">Your Reel is Ready</h1>
              <p className="text-muted-foreground font-body text-sm mt-1">{mood} · {length}s</p>
            </div>

            {/* Video preview placeholder */}
            <div className="aspect-[9/16] max-w-xs mx-auto bg-card border border-border rounded-2xl overflow-hidden mb-6 relative">
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-rose-gold/5 to-accent">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15, delay: 0.2 }}
                  className="w-16 h-16 rounded-full bg-rose-gold/20 flex items-center justify-center mb-4"
                >
                  <Play className="w-7 h-7 text-rose-gold ml-1" />
                </motion.div>
                <p className="font-heading font-medium text-foreground text-sm">{weddingName}</p>
                <p className="text-xs text-muted-foreground font-body mt-1">Highlight Reel</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 max-w-xs mx-auto">
              <Button
                onClick={handleSave}
                className="flex-1 bg-rose-gold hover:bg-rose-gold/90 text-white font-body h-11"
              >
                {saved ? (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-1" />
                    Save to Camera Roll
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-rose-gold text-rose-gold hover:bg-accent font-body h-11"
              >
                <Share2 className="w-4 h-4 mr-1" />
                Share to Instagram
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReelCreator;
