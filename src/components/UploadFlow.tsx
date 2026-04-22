import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Upload, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Wedding, MediaItem } from '@/lib/types';
import { analyzeImageQuality } from '@/lib/image-quality';

interface UploadFlowProps {
  onBack: () => void;
  onComplete: (wedding: Wedding) => void;
}

const UploadFlow = ({ onBack, onComplete }: UploadFlowProps) => {
  const [step, setStep] = useState<'info' | 'upload' | 'uploading' | 'sorting' | 'done'>('info');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [flaggedItems, setFlaggedItems] = useState<MediaItem[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = () => {
    setStep('uploading');
    setUploadProgress(0);
  };

  // Simulate upload progress
  useEffect(() => {
    if (step !== 'uploading') return;
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setStep('sorting');
          return 100;
        }
        return prev + Math.random() * 15 + 5;
      });
    }, 300);
    return () => clearInterval(interval);
  }, [step]);

  // AI sorting + image quality analysis
  useEffect(() => {
    if (step !== 'sorting') return;
    let cancelled = false;

    const analyzePhotos = async () => {
      const photoFiles = files.filter((f) => f.type.startsWith('image/'));
      const flagged: MediaItem[] = [];

      for (let i = 0; i < photoFiles.length; i++) {
        if (cancelled) return;
        const file = photoFiles[i];
        const result = await analyzeImageQuality(file);
        if (result) {
          flagged.push({
            id: `lq-${i}`,
            type: 'photo',
            url: URL.createObjectURL(file),
            thumbnail: URL.createObjectURL(file),
            folder: 'Quality Check',
            flagReason: 'low_quality_photo',
          });
        }
      }

      if (!cancelled) {
        setFlaggedItems(flagged);
        setStep('done');
      }
    };

    analyzePhotos();
    return () => { cancelled = true; };
  }, [step, files]);

  const handleFinish = () => {
    const folderNames = ['Getting Ready', 'Ceremony', 'Portraits', 'Reception', 'Details', 'Miscellaneous'];
    const icons = ['Sparkles', 'Heart', 'Camera', 'PartyPopper', 'Gem', 'FolderOpen'];

    const photoFiles = files.filter((f) => f.type.startsWith('image/'));
    const videoFiles = files.filter((f) => f.type.startsWith('video/'));
    const allMedia = [...photoFiles, ...videoFiles];
    const itemsPerFolder = Math.max(1, Math.floor(allMedia.length / 6));

    const shortClips: MediaItem[] = videoFiles.length > 0
      ? videoFiles.slice(0, Math.min(3, videoFiles.length)).map((f, i) => ({
          id: `new-sc-${i}`,
          type: 'video' as const,
          url: URL.createObjectURL(f),
          thumbnail: URL.createObjectURL(f),
          duration: 1.2 + Math.random(),
          folder: folderNames[i % folderNames.length],
          flagReason: 'short_clip' as const,
        }))
      : [];

    const allFlagged = [...shortClips, ...flaggedItems];

    const newWedding: Wedding = {
      id: Date.now().toString(),
      name,
      date,
      thumbnail: photoFiles.length > 0 ? URL.createObjectURL(photoFiles[0]) : '',
      mediaCount: files.length,
      folders: folderNames.map((fn, i) => {
        const start = i * itemsPerFolder;
        const end = i < 5 ? start + itemsPerFolder : allMedia.length;
        const folderFiles = allMedia.slice(start, Math.min(end, allMedia.length));
        return {
          name: fn,
          icon: icons[i],
          items: folderFiles.map((file, j) => ({
            id: `${fn}-${j}`,
            type: file.type.startsWith('video/') ? 'video' as const : 'photo' as const,
            url: URL.createObjectURL(file),
            thumbnail: URL.createObjectURL(file),
            folder: fn,
          })),
        };
      }),
      shortClips,
      flaggedItems: allFlagged,
    };
    onComplete(newWedding);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {step === 'info' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div>
            <h1 className="text-3xl font-heading font-semibold text-foreground">New Wedding Project</h1>
            <p className="text-muted-foreground font-body mt-1">Enter the wedding details</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-body font-medium text-foreground mb-1.5">Wedding Name</label>
              <Input placeholder="e.g. Sarah & James" value={name} onChange={(e) => setName(e.target.value)} className="h-12 bg-card border-border rounded-lg font-body" />
            </div>
            <div>
              <label className="block text-sm font-body font-medium text-foreground mb-1.5">Wedding Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 bg-card border-border rounded-lg font-body" />
            </div>
          </div>
          <Button onClick={() => setStep('upload')} disabled={!name || !date} className="w-full h-12 gradient-rose text-primary-foreground font-body font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            Continue
          </Button>
        </motion.div>
      )}

      {step === 'upload' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div>
            <h1 className="text-3xl font-heading font-semibold text-foreground">Upload Media</h1>
            <p className="text-muted-foreground font-body mt-1">{name} · {new Date(date).toLocaleDateString()}</p>
          </div>
          <label className="block border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-rose-gold/50 transition-colors bg-card">
            <input type="file" multiple accept="image/*,video/*" onChange={handleFileChange} className="hidden" />
            <Upload className="w-10 h-10 text-rose-gold/50 mx-auto mb-3" />
            <p className="font-body text-foreground font-medium">
              {files.length > 0 ? `${files.length} files selected` : 'Drop files or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground font-body mt-1">Photos and videos</p>
          </label>
          {files.length > 0 && (
            <div className="grid grid-cols-5 gap-1.5">
              {files.slice(0, 10).map((file, i) => (
                <div key={i} className="aspect-square rounded-lg overflow-hidden bg-accent border border-border">
                  {file.type.startsWith('image/') ? (
                    <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
              {files.length > 10 && (
                <div className="aspect-square rounded-lg bg-accent border border-border flex items-center justify-center">
                  <span className="text-xs text-muted-foreground font-body">+{files.length - 10}</span>
                </div>
              )}
            </div>
          )}
          <Button onClick={handleUpload} disabled={files.length === 0} className="w-full h-12 gradient-rose text-primary-foreground font-body font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            Upload & Sort with AI
          </Button>
        </motion.div>
      )}

      {step === 'uploading' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 space-y-6">
          <Upload className="w-12 h-12 text-rose-gold mx-auto animate-pulse" />
          <div>
            <h2 className="font-heading text-2xl text-foreground mb-2">Uploading {files.length} files...</h2>
            <p className="text-muted-foreground font-body text-sm mb-4">{Math.min(Math.round(uploadProgress), 100)}%</p>
            <div className="max-w-sm mx-auto">
              <Progress value={Math.min(uploadProgress, 100)} className="h-2 bg-accent [&>div]:bg-rose-gold" />
            </div>
          </div>
        </motion.div>
      )}

      {step === 'sorting' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 space-y-4">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }} className="w-16 h-16 rounded-full gradient-rose mx-auto flex items-center justify-center">
            <span className="text-primary-foreground text-2xl">✨</span>
          </motion.div>
          <h2 className="font-heading text-2xl text-foreground">AI is sorting your media...</h2>
          <p className="text-muted-foreground font-body">Organizing {files.length} files and checking quality</p>
        </motion.div>
      )}

      {step === 'done' && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-20 space-y-4">
          <CheckCircle className="w-16 h-16 text-rose-gold mx-auto" />
          <h2 className="font-heading text-2xl text-foreground">All sorted!</h2>
          <p className="text-muted-foreground font-body">
            {files.length} files organized into 6 folders
            {flaggedItems.length > 0 && ` · ${flaggedItems.length} low quality photo${flaggedItems.length > 1 ? 's' : ''} flagged`}
          </p>
          <Button onClick={handleFinish} className="gradient-rose text-primary-foreground font-body font-medium hover:opacity-90">
            View Wedding
          </Button>
        </motion.div>
      )}
    </div>
  );
};

export default UploadFlow;
