import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { analyzeImageQuality } from '@/lib/image-quality';
import { supabase } from '@/integrations/supabase/client';
import { createWeddingInDb, deleteWeddingById, insertMediaItem, uploadMediaFile } from '@/lib/supabase-helpers';

interface UploadFlowProps {
  onBack: () => void;
  onComplete: () => void;
}

const FOLDER_NAMES = ['Getting Ready', 'Ceremony', 'Portraits', 'Reception', 'Details', 'Miscellaneous'];
const MAX_PARALLEL_UPLOADS = 2;
// Allow up to 10 minutes per file so very large videos on slow connections still finish
const PER_FILE_TIMEOUT_MS = 10 * 60 * 1000;
// Cap individual file size at 500MB (Supabase storage default upper limit)
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
const VIDEO_METADATA_TIMEOUT_MS = 8000;
const RENDER_DELAY_MS = 50;

const UploadFlow = ({ onBack, onComplete }: UploadFlowProps) => {
  const [step, setStep] = useState<'info' | 'upload' | 'uploading' | 'sorting' | 'done'>('info');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState('Preparing upload...');

  const mediaFiles = useMemo(
    () => files.filter((f) => isSupportedMediaFile(f) && f.size <= MAX_FILE_SIZE_BYTES),
    [files],
  );
  const oversizeCount = useMemo(
    () => files.filter((f) => isSupportedMediaFile(f) && f.size > MAX_FILE_SIZE_BYTES).length,
    [files],
  );
  const skippedCount = files.length - mediaFiles.length - oversizeCount;
  const previewFiles = useMemo(() => files.slice(0, 10), [files]);
  const previewUrls = useMemo(
    () => previewFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [previewFiles],
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach(({ url }) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setErrorMessage(null);
      setFailedCount(0);
      setFlaggedCount(0);
    }
  };

  const handleUpload = async () => {
    if (mediaFiles.length === 0) {
      setErrorMessage('Please choose at least one photo or video to upload.');
      return;
    }

    setStep('uploading');
    setUploadProgress(0);
    setUploadStatus('Preparing your files...');
    setErrorMessage(null);
    setFailedCount(0);
    setFlaggedCount(0);

    let weddingId: string | null = null;
    let successCount = 0;

    try {
      await delay(RENDER_DELAY_MS);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Not authenticated');
      }

      weddingId = await createWeddingInDb(user.id, name, date);

      let completed = 0;
      let flagged = 0;
      let failed = 0;

      for (let start = 0; start < mediaFiles.length; start += MAX_PARALLEL_UPLOADS) {
        const batch = mediaFiles.slice(start, start + MAX_PARALLEL_UPLOADS);
        const batchStart = start + 1;
        const batchEnd = Math.min(start + batch.length, mediaFiles.length);

        setUploadStatus(`Uploading ${batchStart}-${batchEnd} of ${mediaFiles.length}...`);

        const results = await Promise.allSettled(
          batch.map(async (file, batchIndex) => {
            try {
              const result = await withTimeout(
                processMediaFile(weddingId as string, file, start + batchIndex),
                PER_FILE_TIMEOUT_MS,
                `Upload timed out for ${file.name}`,
              );

              successCount += 1;
              if (result.flagged) {
                flagged += 1;
              }
            } finally {
              completed += 1;
              setUploadProgress((completed / mediaFiles.length) * 100);
            }
          }),
        );

        results.forEach((result) => {
          if (result.status === 'rejected') {
            failed += 1;
            console.error('File upload failed:', result.reason);
          }
        });
      }

      if (successCount === 0) {
        throw new Error('All uploads failed');
      }

      setFlaggedCount(flagged);
      setFailedCount(failed);
      setUploadProgress(100);
      setUploadStatus('Finishing up...');
      setStep('sorting');

      setTimeout(() => setStep('done'), 1500);
    } catch (err) {
      console.error('Upload error:', err);

      if (weddingId && successCount === 0) {
        try {
          await deleteWeddingById(weddingId);
        } catch (cleanupError) {
          console.error('Failed to clean up empty wedding:', cleanupError);
        }
      }

      setErrorMessage('Upload failed. Try a smaller batch, then retry.');
      setStep('upload');
    }
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
              {files.length > 0 ? `${mediaFiles.length} supported file${mediaFiles.length === 1 ? '' : 's'} selected` : 'Drop files or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground font-body mt-1">Photos and videos</p>
            {skippedCount > 0 && (
              <p className="text-xs text-muted-foreground font-body mt-1">{skippedCount} unsupported file{skippedCount === 1 ? '' : 's'} will be skipped</p>
            )}
          </label>
          {errorMessage && (
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-body text-foreground">
              {errorMessage}
            </div>
          )}
          {files.length > 0 && (
            <div className="grid grid-cols-5 gap-1.5">
              {previewUrls.map(({ file, url }, i) => (
                <div key={`${file.name}-${i}`} className="aspect-square rounded-lg overflow-hidden bg-accent border border-border">
                  {file.type.startsWith('image/') ? (
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={url} className="w-full h-full object-cover" />
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
          <Button onClick={handleUpload} disabled={mediaFiles.length === 0} className="w-full h-12 gradient-rose text-primary-foreground font-body font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            Upload & Sort with AI
          </Button>
        </motion.div>
      )}

      {step === 'uploading' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 space-y-6">
          <Upload className="w-12 h-12 text-rose-gold mx-auto animate-pulse" />
          <div>
            <h2 className="font-heading text-2xl text-foreground mb-2">Uploading {mediaFiles.length} files...</h2>
            <p className="text-muted-foreground font-body text-sm">{uploadStatus}</p>
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
          <p className="text-muted-foreground font-body">Organizing {mediaFiles.length} files and checking quality</p>
        </motion.div>
      )}

      {step === 'done' && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-20 space-y-4">
          <CheckCircle className="w-16 h-16 text-rose-gold mx-auto" />
          <h2 className="font-heading text-2xl text-foreground">All sorted!</h2>
          <p className="text-muted-foreground font-body">
            {Math.max(mediaFiles.length - failedCount, 0)} files organized into 6 folders
            {flaggedCount > 0 && ` · ${flaggedCount} item${flaggedCount > 1 ? 's' : ''} flagged for review`}
            {failedCount > 0 && ` · ${failedCount} failed`}
          </p>
          <Button onClick={onComplete} className="gradient-rose text-primary-foreground font-body font-medium hover:opacity-90">
            View Wedding
          </Button>
        </motion.div>
      )}
    </div>
  );
};

async function processMediaFile(weddingId: string, file: File, fileIndex: number): Promise<{ flagged: boolean }> {
  const isPhoto = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const folder = FOLDER_NAMES[fileIndex % FOLDER_NAMES.length];

  const { storagePath } = await uploadMediaFile(weddingId, file, folder);

  let flagReason: string | null = null;
  let duration: number | null = null;

  if (isPhoto) {
    flagReason = await analyzeImageQuality(file);
  }

  if (isVideo) {
    duration = await getVideoDuration(file);
    if (duration !== null && duration < 3) {
      flagReason = 'short_clip';
    }
  }

  await insertMediaItem({
    wedding_id: weddingId,
    type: isVideo ? 'video' : 'photo',
    folder,
    storage_path: storagePath,
    flag_reason: flagReason,
    duration,
  });

  return { flagged: Boolean(flagReason) };
}

function isSupportedMediaFile(file: File) {
  return file.type.startsWith('image/') || file.type.startsWith('video/');
}

function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    video.src = objectUrl;
  });
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

export default UploadFlow;
