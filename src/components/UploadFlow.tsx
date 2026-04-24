import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { analyzeImageQuality } from '@/lib/image-quality';
import { supabase } from '@/integrations/supabase/client';
import {
  createWeddingInDb,
  deleteWeddingById,
  insertMediaItem,
  uploadMediaFile,
} from '@/lib/supabase-helpers';
import { generatePhotoPreview, generateVideoPoster } from '@/lib/poster-frame';
import { enqueueUpload } from '@/lib/upload-queue';

interface UploadFlowProps {
  onBack: () => void;
  onComplete: (weddingId?: string) => void;
}

const UNSORTED_FOLDER = 'Unsorted';
// Cap individual file size at 500MB (Supabase storage default upper limit)
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
const VIDEO_METADATA_TIMEOUT_MS = 8000;
const PER_PREVIEW_TIMEOUT_MS = 30 * 1000;
// Soft limit — warn users when uploading exceptionally large batches.
const LARGE_BATCH_WARNING_THRESHOLD = 200;

const UploadFlow = ({ onBack, onComplete }: UploadFlowProps) => {
  const [step, setStep] = useState<'info' | 'upload' | 'preparing' | 'done'>('info');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [prepProgress, setPrepProgress] = useState(0);
  const [prepStatus, setPrepStatus] = useState('Preparing previews...');
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdWeddingId, setCreatedWeddingId] = useState<string | null>(null);
  const [showLargeBatchWarning, setShowLargeBatchWarning] = useState(false);

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

  const handleUploadClick = () => {
    if (mediaFiles.length === 0) {
      setErrorMessage('Please choose at least one photo or video to upload.');
      return;
    }
    if (mediaFiles.length > LARGE_BATCH_WARNING_THRESHOLD) {
      setShowLargeBatchWarning(true);
      return;
    }
    void handleUpload();
  };

  const handleUpload = async () => {
    if (mediaFiles.length === 0) {
      setErrorMessage('Please choose at least one photo or video to upload.');
      return;
    }

    setStep('preparing');
    setPrepProgress(0);
    setPrepStatus('Creating instant previews...');
    setErrorMessage(null);
    setFailedCount(0);
    setFlaggedCount(0);

    let weddingId: string | null = null;
    let prepared = 0;
    let flagged = 0;
    let failed = 0;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      weddingId = await createWeddingInDb(user.id, name, date);
      setCreatedWeddingId(weddingId);

      // Process files in sequential batches of 5. Each batch fully completes
      // before the next starts. Failures within a batch are isolated so one bad
      // file never freezes the whole upload.
      const BATCH_SIZE = 5;
      for (let batchStart = 0; batchStart < mediaFiles.length; batchStart += BATCH_SIZE) {
        const batch = mediaFiles.slice(batchStart, batchStart + BATCH_SIZE);
        setPrepStatus(`Uploading ${batchStart + 1}–${Math.min(batchStart + batch.length, mediaFiles.length)} of ${mediaFiles.length} files`);

        const results = await Promise.allSettled(
          batch.map((file, idx) =>
            withTimeout(
              prepareAndQueue(weddingId, file, batchStart + idx),
              PER_PREVIEW_TIMEOUT_MS,
              `Preview generation timed out for ${file.name}`,
            ),
          ),
        );

        results.forEach((res, idx) => {
          if (res.status === 'fulfilled') {
            if (res.value.flagged) flagged += 1;
          } else {
            console.error('Failed to prepare file:', batch[idx].name, res.reason);
            failed += 1;
          }
          prepared += 1;
        });
        setPrepProgress((prepared / mediaFiles.length) * 100);
        setPrepStatus(`Uploading ${Math.min(prepared, mediaFiles.length)} of ${mediaFiles.length} files`);
      }

      if (prepared - failed === 0) throw new Error('All files failed to prepare');

      setFlaggedCount(flagged);
      setFailedCount(failed);
      setPrepProgress(100);
      setStep('done');
    } catch (err) {
      console.error('Upload prep error:', err);
      if (weddingId && prepared - failed === 0) {
        try {
          await deleteWeddingById(weddingId);
        } catch (cleanupError) {
          console.error('Failed to clean up empty wedding:', cleanupError);
        }
      }
      setErrorMessage('Could not prepare your files. Please try again with a smaller batch.');
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
            <p className="text-xs text-muted-foreground font-body mt-1">Photos and videos · originals upload in the background</p>
            {skippedCount > 0 && (
              <p className="text-xs text-muted-foreground font-body mt-1">{skippedCount} unsupported file{skippedCount === 1 ? '' : 's'} will be skipped</p>
            )}
            {oversizeCount > 0 && (
              <p className="text-xs text-rose-gold font-body mt-1">{oversizeCount} file{oversizeCount === 1 ? '' : 's'} over 500MB will be skipped</p>
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
            Upload to Unsorted
          </Button>
        </motion.div>
      )}

      {step === 'preparing' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 space-y-6">
          <Upload className="w-12 h-12 text-rose-gold mx-auto animate-pulse" />
          <div>
            <h2 className="font-heading text-2xl text-foreground mb-2">Preparing your files...</h2>
            <p className="text-muted-foreground font-body text-sm">{prepStatus}</p>
            <p className="text-muted-foreground font-body text-sm mb-4">{Math.min(Math.round(prepProgress), 100)}%</p>
            <div className="max-w-sm mx-auto">
              <Progress value={Math.min(prepProgress, 100)} className="h-2 bg-accent [&>div]:bg-rose-gold" />
            </div>
            <p className="text-xs text-muted-foreground font-body mt-4 max-w-sm mx-auto">
              Creating instant previews so you can see everything right away. Originals upload in the background.
            </p>
          </div>
        </motion.div>
      )}

      {step === 'done' && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-20 space-y-4">
          <CheckCircle className="w-16 h-16 text-rose-gold mx-auto" />
          <h2 className="font-heading text-2xl text-foreground">Ready to view!</h2>
          <p className="text-muted-foreground font-body">
            {Math.max(mediaFiles.length - failedCount, 0)} file{mediaFiles.length - failedCount === 1 ? '' : 's'} ready to browse
            {flaggedCount > 0 && ` · ${flaggedCount} flagged for review`}
            {failedCount > 0 && ` · ${failedCount} failed`}
          </p>
          <p className="text-xs text-muted-foreground font-body max-w-sm mx-auto">
            Originals are uploading in the background — you can keep using the app.
          </p>
          <Button onClick={() => onComplete(createdWeddingId || undefined)} className="gradient-rose text-primary-foreground font-body font-medium hover:opacity-90">
            View Wedding
          </Button>
        </motion.div>
      )}
    </div>
  );
};

async function prepareAndQueue(weddingId: string, file: File, _fileIndex: number): Promise<{ flagged: boolean }> {
  const isPhoto = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  // All new uploads land in "Unsorted". The user triggers categorization
  // intentionally via the "Sort My Footage" button on the wedding page.
  const folder = UNSORTED_FOLDER;

  let flagReason: string | null = null;
  let duration: number | null = null;
  let previewBlob: Blob | null = null;

  if (isPhoto) {
    flagReason = await analyzeImageQuality(file).catch(() => null);
    previewBlob = await generatePhotoPreview(file).catch(() => null);
  }

  if (isVideo) {
    duration = await getVideoDuration(file);
    if (duration !== null && duration < 3) flagReason = 'short_clip';
    previewBlob = await generateVideoPoster(file).catch(() => null);
  }

  // Upload the small preview first so the thumbnail is available immediately.
  let previewPath: string | null = null;
  if (previewBlob) {
    try {
      const { storagePath } = await uploadMediaFile(weddingId, previewBlob, folder, 'jpg', 'preview');
      previewPath = storagePath;
    } catch (err) {
      console.warn('Preview upload failed (continuing without preview):', err);
    }
  }

  // For photos with no preview (already small), use the original as the preview by uploading it now.
  // For videos without a poster, we still queue the original; the grid will show a film icon until it lands.
  let initialPath: string;
  if (isPhoto && !previewPath) {
    const { storagePath } = await uploadMediaFile(weddingId, file, folder, getExt(file), 'original');
    initialPath = storagePath;
    // Insert as already complete since we have the original.
    const ext = getExt(file);
    await insertMediaItem({
      wedding_id: weddingId,
      type: 'photo',
      folder,
      storage_path: initialPath,
      preview_storage_path: previewPath,
      upload_status: 'complete',
      flag_reason: flagReason,
      duration,
    });
    void ext;
    return { flagged: Boolean(flagReason) };
  }

  // Pending path: insert row referencing the preview as a placeholder for storage_path,
  // then queue the original to overwrite storage_path on completion.
  const placeholderPath = previewPath || `${weddingId}/${folder}/pending/${crypto.randomUUID()}`;
  const mediaId = await insertMediaItem({
    wedding_id: weddingId,
    type: isVideo ? 'video' : 'photo',
    folder,
    storage_path: placeholderPath,
    preview_storage_path: previewPath,
    upload_status: 'pending',
    flag_reason: flagReason,
    duration,
  });

  enqueueUpload({
    mediaId,
    weddingId,
    folder,
    file,
    ext: getExt(file),
  });

  return { flagged: Boolean(flagReason) };
}

function getExt(file: File): string {
  return file.name.split('.').pop() || 'bin';
}

function isSupportedMediaFile(file: File) {
  return file.type.startsWith('image/') || file.type.startsWith('video/');
}

function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(value);
    };

    video.preload = 'metadata';
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = objectUrl;

    window.setTimeout(() => finish(null), VIDEO_METADATA_TIMEOUT_MS);
  });
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
