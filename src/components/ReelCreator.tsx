import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Film, Play, Download, Share2, Check, Music, Upload, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Mood = 'Romantic' | 'Fun & Upbeat' | 'Cinematic' | 'Emotional';
type ReelLength = 15 | 30 | 60;
type Step = 'options' | 'generating' | 'preview' | 'error';

const moods: { label: Mood; emoji: string; desc: string }[] = [
  { label: 'Romantic', emoji: '💕', desc: 'Soft, dreamy transitions' },
  { label: 'Fun & Upbeat', emoji: '🎉', desc: 'Energetic, fast-paced cuts' },
  { label: 'Cinematic', emoji: '🎬', desc: 'Dramatic, film-like feel' },
  { label: 'Emotional', emoji: '🥹', desc: 'Slow, heartfelt moments' },
];
const lengths: { value: ReelLength; label: string }[] = [
  { value: 15, label: '15s' }, { value: 30, label: '30s' }, { value: 60, label: '60s' },
];

interface ReelCreatorProps {
  weddingId: string;
  weddingName: string;
  onBack: () => void;
}

const ReelCreator = ({ weddingId, weddingName, onBack }: ReelCreatorProps) => {
  const [step, setStep] = useState<Step>('options');
  const [mood, setMood] = useState<Mood | null>(null);
  const [length, setLength] = useState<ReelLength>(30);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicUploading, setMusicUploading] = useState(false);
  const [statusLabel, setStatusLabel] = useState('Picking your best clips…');
  const [progress, setProgress] = useState(8);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [saved, setSaved] = useState(false);
  const pollTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (pollTimer.current) window.clearInterval(pollTimer.current); }, []);

  const handleMusicPick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('audio/')) {
      toast.error('Please choose an audio file (MP3, WAV, M4A).');
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast.error('Audio file too large (max 25MB).');
      return;
    }
    setMusicFile(f);
  };

  const uploadMusic = async (): Promise<string | null> => {
    if (!musicFile) return null;
    setMusicUploading(true);
    try {
      const ext = musicFile.name.split('.').pop() || 'mp3';
      const path = `${weddingId}/reels/audio/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('wedding-media').upload(path, musicFile, {
        contentType: musicFile.type, upsert: false,
      });
      if (error) throw error;
      return path;
    } finally {
      setMusicUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!mood) return;
    setStep('generating');
    setProgress(8);
    setStatusLabel('Uploading music…');
    try {
      const musicPath = musicFile ? await uploadMusic() : null;
      setStatusLabel('AI is picking your best clips…');
      setProgress(20);
      const { data, error } = await supabase.functions.invoke('generate-reel', {
        body: { weddingId, mood, length, musicStoragePath: musicPath },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const reelId = data.reelId as string;
      setStatusLabel(`Rendering your ${length}s reel from ${data.clipCount} clips…`);
      setProgress(45);
      startPolling(reelId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      setErrorMsg(msg);
      setStep('error');
    }
  };

  const startPolling = (reelId: string) => {
    let bumps = 45;
    pollTimer.current = window.setInterval(async () => {
      bumps = Math.min(bumps + 2, 92);
      setProgress(bumps);
      try {
        const { data, error } = await supabase.functions.invoke('reel-status', { body: { reelId } });
        if (error) return;
        if (data?.status === 'complete' && data.url) {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          setProgress(100);
          setVideoUrl(data.url);
          setTimeout(() => setStep('preview'), 400);
        } else if (data?.status === 'failed') {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          setErrorMsg('The render service failed. Please try again.');
          setStep('error');
        }
      } catch {/* keep polling */}
    }, 5000);
  };

  const handleDownload = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `${weddingName}-reel.mp4`;
    a.click();
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
        {step === 'options' && (
          <motion.div key="options" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-rose-gold/10 flex items-center justify-center mx-auto mb-4">
                <Film className="w-7 h-7 text-rose-gold" />
              </div>
              <h1 className="text-2xl font-heading font-semibold text-foreground">Create Reel</h1>
              <p className="text-muted-foreground font-body text-sm mt-1">AI picks your best clips and stitches them into a real MP4</p>
            </div>

            <div className="mb-8">
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-3 block">Mood</label>
              <div className="grid grid-cols-2 gap-3">
                {moods.map((m) => (
                  <button key={m.label} onClick={() => setMood(m.label)}
                    className={`p-4 rounded-xl border text-left transition-all duration-200 ${mood === m.label ? 'border-rose-gold bg-rose-gold/10 shadow-sm' : 'border-border bg-card hover:border-rose-gold-light/40'}`}>
                    <span className="text-xl mb-1 block">{m.emoji}</span>
                    <span className="font-heading font-medium text-foreground text-sm block">{m.label}</span>
                    <span className="font-body text-[11px] text-muted-foreground">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-3 block">Length</label>
              <div className="flex gap-3">
                {lengths.map((l) => (
                  <button key={l.value} onClick={() => setLength(l.value)}
                    className={`flex-1 py-3 rounded-xl border font-heading font-medium text-sm transition-all duration-200 ${length === l.value ? 'border-rose-gold bg-rose-gold/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:border-rose-gold-light/40'}`}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <label className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-3 block">Music (optional)</label>
              <input ref={fileInput} type="file" accept="audio/*" className="hidden"
                onChange={(e) => handleMusicPick(e.target.files?.[0] || null)} />
              {!musicFile ? (
                <button onClick={() => fileInput.current?.click()}
                  className="w-full p-4 rounded-xl border border-dashed border-border bg-card hover:border-rose-gold-light/40 flex items-center justify-center gap-2 text-muted-foreground font-body text-sm transition-colors">
                  <Upload className="w-4 h-4" />
                  Upload an audio track (MP3, WAV, M4A · max 25MB)
                </button>
              ) : (
                <div className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
                  <Music className="w-5 h-5 text-rose-gold flex-shrink-0" />
                  <span className="font-body text-sm text-foreground truncate flex-1">{musicFile.name}</span>
                  <button onClick={() => setMusicFile(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <Button onClick={handleGenerate} disabled={!mood || musicUploading}
              className="w-full bg-rose-gold hover:bg-rose-gold/90 text-white font-body h-12 text-base">
              <Film className="w-4 h-4 mr-2" />
              Generate Reel
            </Button>
            <p className="text-[11px] text-muted-foreground font-body text-center mt-3">
              Uses sorted videos from this project. Sandbox renders include a Shotstack watermark.
            </p>
          </motion.div>
        )}

        {step === 'generating' && (
          <motion.div key="generating" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center justify-center py-20">
            <div className="relative w-28 h-28 mb-8">
              <motion.div className="absolute inset-0 rounded-full border-2 border-rose-gold/30"
                animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />
              <motion.div className="absolute inset-2 rounded-full border-2 border-rose-gold/40"
                animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0.1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }} />
              <motion.div className="absolute inset-4 rounded-full border-2 border-rose-gold/50"
                animate={{ scale: [1, 1.2, 1], opacity: [0.7, 0.2, 0.7] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Film className="w-8 h-8 text-rose-gold" />
              </div>
            </div>
            <h2 className="text-xl font-heading font-semibold text-foreground mb-2">{statusLabel}</h2>
            <p className="text-muted-foreground font-body text-sm mb-6">{mood} · {length}s</p>
            <div className="w-full max-w-xs">
              <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                <motion.div className="h-full bg-rose-gold rounded-full"
                  animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut' }} />
              </div>
              <p className="text-xs text-muted-foreground font-body text-center mt-2">
                This usually takes 1–3 minutes
              </p>
            </div>
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7 text-destructive" />
            </div>
            <h2 className="text-xl font-heading font-semibold text-foreground mb-2">Couldn't create reel</h2>
            <p className="text-muted-foreground font-body text-sm mb-6 max-w-xs">{errorMsg}</p>
            <Button onClick={() => setStep('options')} variant="outline">Try again</Button>
          </motion.div>
        )}

        {step === 'preview' && videoUrl && (
          <motion.div key="preview" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-heading font-semibold text-foreground">Your Reel is Ready</h1>
              <p className="text-muted-foreground font-body text-sm mt-1">{mood} · {length}s</p>
            </div>
            <div className="aspect-[9/16] max-w-xs mx-auto bg-black rounded-2xl overflow-hidden mb-6">
              <video src={videoUrl} controls autoPlay playsInline className="w-full h-full object-contain" />
            </div>
            <div className="flex gap-3 max-w-xs mx-auto">
              <Button onClick={handleDownload} className="flex-1 bg-rose-gold hover:bg-rose-gold/90 text-white font-body h-11">
                {saved ? (<><Check className="w-4 h-4 mr-1" />Saved!</>) : (<><Download className="w-4 h-4 mr-1" />Download</>)}
              </Button>
              <Button variant="outline" onClick={() => navigator.share?.({ url: videoUrl, title: `${weddingName} reel` }).catch(() => {})}
                className="flex-1 border-rose-gold text-rose-gold hover:bg-accent font-body h-11">
                <Share2 className="w-4 h-4 mr-1" />Share
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReelCreator;
