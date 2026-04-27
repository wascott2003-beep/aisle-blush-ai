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
  const [isProcessingSelection, setIsProcessingSelection] = useState(false);
  const [selectionProgress, setSelectionProgress] = useState({ done: 0, total: 0 });
  const [counts, setCounts] = useState({ supported: 0, oversize: 0, skipped: 0 });
  const [previewUrls, setPreviewUrls] = useState<{ file: File; url: string }[]>([]);

  const mediaFiles = useMemo(
    () => files.filter((f) => isSupportedMediaFile(f) && f.size <= MAX_FILE_SIZE_BYTES),
    [files],
  );

  // Revoke preview URLs on unmount or when they change.
  useEffect(() => {
    return () => {
      previewUrls.forEach(({ url }) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    // Reset error state immediately so the UI feels responsive.
    setErrorMessage(null);
    setFailedCount(0);
    setFlaggedCount(0);

    // Clear previous preview URLs.
    setPreviewUrls((prev) => {
      prev.forEach(({ url }) => URL.revokeObjectURL(url));
      return [];
    });

    const total = fileList.length;
    setIsProcessingSelection(true);
    setSelectionProgress({ done: 0, total });
    setCounts({ supported: 0, oversize: 0, skipped: 0 });

    // Process the FileList in small chunks, yielding to the main thread between
    // each chunk so the mobile browser stays responsive while iOS/Android
    // serializes hundreds of HEIC/MP4 file handles.
    const CHUNK = 25;
    const collected: File[] = [];
    const newPreviews: { file: File; url: string }[] = [];
    let supported = 0;
    let oversize = 0;
    let skipped = 0;

    for (let i = 0; i < total; i += CHUNK) {
      const end = Math.min(i + CHUNK, total);
      for (let j = i; j < end; j++) {
        const file = fileList[j];
        collected.push(file);
        if (isSupportedMediaFile(file)) {
          if (file.size <= MAX_FILE_SIZE_BYTES) {
            supported += 1;
            // Only build object URLs for the first 10 previews to keep memory low.
            if (newPreviews.length < 10) {
              newPreviews.push({ file, url: URL.createObjectURL(file) });
            }
          } else {
            oversize += 1;
          }
        } else {
          skipped += 1;
        }
      }
      // Update UI progress and yield to the event loop so the picker can close
      // and the main thread can paint between chunks.
      setSelectionProgress({ done: end, total });
      setCounts({ supported, oversize, skipped });
      await yieldToMain();
    }

    setFiles(collected);
    setPreviewUrls(newPreviews);
    setIsProcessingSelection(false);

    // Allow re-selecting the same files later.
    e.target.value = '';
  };

  const oversizeCount = counts.oversize;
  const skippedCount = counts.skipped;

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
            <input type="file" multiple accept="image/*,video/*" onChange={handleFileChange} className="hidden" disabled={isProcessingSelection} />
            <Upload className={`w-10 h-10 text-rose-gold/50 mx-auto mb-3 ${isProcessingSelection ? 'animate-pulse' : ''}`} />
            <p className="font-body text-foreground font-medium">
              {isProcessingSelection
                ? `Reading ${selectionProgress.done} of ${selectionProgress.total} files…`
                : files.length > 0
                  ? `${mediaFiles.length} supported file${mediaFiles.length === 1 ? '' : 's'} selected`
                  : 'Drop files or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground font-body mt-1">Photos and videos · originals upload in the background</p>
            {!isProcessingSelection && skippedCount > 0 && (
              <p className="text-xs text-muted-foreground font-body mt-1">{skippedCount} unsupported file{skippedCount === 1 ? '' : 's'} will be skipped</p>
            )}
            {!isProcessingSelection && oversizeCount > 0 && (
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
          <Button onClick={handleUploadClick} disabled={mediaFiles.length === 0 || isProcessingSelection} className="w-full h-12 gradient-rose text-primary-foreground font-body font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {isProcessingSelection ? 'Reading files…' : 'Upload to Unsorted'}
          </Button>
        </motion.div>
      )}

      <AlertDialog open={showLargeBatchWarning} onOpenChange={setShowLargeBatchWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Large upload detected</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              You've selected {mediaFiles.length} files. For best results, upload in batches of {LARGE_BATCH_WARNING_THRESHOLD} files or less. Large weddings can be split across multiple uploads.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body">Go back & reduce</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowLargeBatchWarning(false);
                void handleUpload();
              }}
              className="gradient-rose text-primary-foreground font-body"
            >
              Continue anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

// Yield to the browser between chunks so the UI thread can paint and the
// native file picker can fully dismiss on mobile. Prefers requestIdleCallback
// when available, otherwise falls back to a 0ms timeout / microtask.
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(() => resolve(), { timeout: 50 });
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}

export default UploadFlow;
