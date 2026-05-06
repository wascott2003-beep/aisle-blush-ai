import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Upload, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
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
import { generatePhotoPreview, extractVideoMeta } from '@/lib/poster-frame';
import { enqueueUpload } from '@/lib/upload-queue';

interface UploadFlowProps {
  onBack: () => void;
  onComplete: (weddingId?: string) => void;
  /** When provided, skip wedding creation and upload directly to this wedding */
  existingWeddingId?: string;
  existingWeddingName?: string;
  existingWeddingDate?: string;
}

const UNSORTED_FOLDER = 'Unsorted';
// Cap individual file size at 500MB (Supabase storage default upper limit)
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

const PER_PREVIEW_TIMEOUT_MS = 30 * 1000;
// Soft limit — warn users when uploading exceptionally large batches.
const LARGE_BATCH_WARNING_THRESHOLD = 200;

const UploadFlow = ({ onBack, onComplete, existingWeddingId, existingWeddingName, existingWeddingDate }: UploadFlowProps) => {
  const isAddMore = !!existingWeddingId;
  const [step, setStep] = useState<'info' | 'upload' | 'preparing' | 'done'>(isAddMore ? 'upload' : 'info');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  // Lazy: hold the raw FileList(s) without iterating. iOS Safari materializes
  // video file handles on access, so we MUST NOT touch .size/.type/etc until
  // we are about to upload that specific file.
  const [photoSelection, setPhotoSelection] = useState<FileList | null>(null);
  const [videoSelection, setVideoSelection] = useState<FileList | null>(null);
  const [prepProgress, setPrepProgress] = useState(0);
  const [prepStatus, setPrepStatus] = useState('Preparing previews...');
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [oversizeCount, setOversizeCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdWeddingId, setCreatedWeddingId] = useState<string | null>(null);
  const [showLargeBatchWarning, setShowLargeBatchWarning] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const photoCount = photoSelection?.length ?? 0;
  const videoCount = videoSelection?.length ?? 0;
  const totalSelected = photoCount + videoCount;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Just store the FileList reference. Do NOT iterate or read any file metadata.
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setPhotoSelection(list);
    setErrorMessage(null);
    setFailedCount(0);
    setFlaggedCount(0);
    setSkippedCount(0);
    setOversizeCount(0);
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setVideoSelection(list);
    setErrorMessage(null);
    setFailedCount(0);
    setFlaggedCount(0);
    setSkippedCount(0);
    setOversizeCount(0);
  };

  const clearSelection = () => {
    setPhotoSelection(null);
    setVideoSelection(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  // Iterate FileList lazily — yields a File one at a time without converting
  // to an array up front. Safe to call inside the upload loop because each
  // access is paired with an await, giving the main thread time to breathe.
  function* iterateSelections(): Generator<File> {
    if (photoSelection) {
      for (let i = 0; i < photoSelection.length; i++) {
        yield photoSelection[i];
      }
    }
    if (videoSelection) {
      for (let i = 0; i < videoSelection.length; i++) {
        yield videoSelection[i];
      }
    }
  }

  const handleUploadClick = () => {
    if (totalSelected === 0) {
      setErrorMessage('Please choose at least one photo or video to upload.');
      return;
    }
    if (totalSelected > LARGE_BATCH_WARNING_THRESHOLD) {
      setShowLargeBatchWarning(true);
      return;
    }
    void handleUpload();
  };

  const handleUpload = async () => {
    if (totalSelected === 0) {
      setErrorMessage('Please choose at least one photo or video to upload.');
      return;
    }

    setStep('preparing');
    setPrepProgress(0);
    setPrepStatus('Creating instant previews...');
    setErrorMessage(null);
    setFailedCount(0);
    setFlaggedCount(0);

    let weddingId: string | null = existingWeddingId || null;
    let prepared = 0;
    let flagged = 0;
    let failed = 0;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (!weddingId) {
        weddingId = await createWeddingInDb(user.id, name, date);
      }
      setCreatedWeddingId(weddingId);

      // Process files one at a time for videos (they create heavy <video>
      // elements that freeze iOS if parallelised) and in small batches for
      // photos. This keeps the browser responsive on mobile.
      const PHOTO_BATCH_SIZE = 5;
      const iterator = iterateSelections();
      let localSkipped = 0;
      let localOversize = 0;

      // Collect validated files lazily
      while (true) {
        const next = iterator.next();
        if (next.done) break;
        const file = next.value;

        if (!isSupportedMediaFile(file)) { localSkipped += 1; prepared += 1; continue; }
        if (file.size > MAX_FILE_SIZE_BYTES) { localOversize += 1; prepared += 1; continue; }

        const isVideo = file.type.startsWith('video/');

        if (isVideo) {
          // Videos: process ONE AT A TIME to avoid iOS freeze
          setPrepStatus(`Processing video ${prepared + 1} of ${totalSelected}`);
          try {
            const result = await withTimeout(
              prepareAndQueue(weddingId!, file, prepared),
              PER_PREVIEW_TIMEOUT_MS,
              `Preview generation timed out for ${file.name}`,
            );
            if (result.flagged) flagged += 1;
          } catch (err) {
            console.error('Failed to prepare file:', file.name, err);
            failed += 1;
          }
          prepared += 1;
          setPrepProgress((prepared / totalSelected) * 100);
        } else {
          // Photos: collect a small batch then process in parallel
          const photoBatch: File[] = [file];
          while (photoBatch.length < PHOTO_BATCH_SIZE) {
            const peek = iterator.next();
            if (peek.done) break;
            if (!isSupportedMediaFile(peek.value)) { localSkipped += 1; prepared += 1; continue; }
            if (peek.value.size > MAX_FILE_SIZE_BYTES) { localOversize += 1; prepared += 1; continue; }
            if (peek.value.type.startsWith('video/')) {
              // Put this video back by processing it in the next outer loop iteration.
              // We can't "unget" from a generator, so process it inline now.
              setPrepStatus(`Processing video ${prepared + 1} of ${totalSelected}`);
              try {
                const r = await withTimeout(
                  prepareAndQueue(weddingId!, peek.value, prepared),
                  PER_PREVIEW_TIMEOUT_MS,
                  `Preview generation timed out for ${peek.value.name}`,
                );
                if (r.flagged) flagged += 1;
              } catch (err) {
                console.error('Failed to prepare file:', peek.value.name, err);
                failed += 1;
              }
              prepared += 1;
              setPrepProgress((prepared / totalSelected) * 100);
              continue;
            }
            photoBatch.push(peek.value);
          }

          setPrepStatus(`Uploading ${prepared + 1}–${prepared + photoBatch.length} of ${totalSelected} files`);
          const results = await Promise.allSettled(
            photoBatch.map((f, idx) =>
              withTimeout(
                prepareAndQueue(weddingId!, f, prepared + idx),
                PER_PREVIEW_TIMEOUT_MS,
                `Preview generation timed out for ${f.name}`,
              ),
            ),
          );
          results.forEach((res, idx) => {
            if (res.status === 'fulfilled') {
              if (res.value.flagged) flagged += 1;
            } else {
              console.error('Failed to prepare file:', photoBatch[idx].name, res.reason);
              failed += 1;
            }
            prepared += 1;
          });
          setPrepProgress((prepared / totalSelected) * 100);
        }
        setPrepStatus(`Uploading ${Math.min(prepared, totalSelected)} of ${totalSelected} files`);
      }

      setSkippedCount(localSkipped);
      setOversizeCount(localOversize);

      if (prepared - failed === 0) throw new Error('All files failed to prepare');

      setFlaggedCount(flagged);
      setFailedCount(failed);
      setPrepProgress(100);
      setStep('done');
    } catch (err) {
      console.error('Upload prep error:', err);
      if (weddingId && !isAddMore && prepared - failed === 0) {
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
            <h1 className="text-3xl font-heading font-semibold text-foreground">{isAddMore ? 'Add More Media' : 'Upload Media'}</h1>
            <p className="text-muted-foreground font-body mt-1">{isAddMore ? existingWeddingName : name} · {new Date(isAddMore ? existingWeddingDate! : date).toLocaleDateString()}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-rose-gold/50 transition-colors bg-card">
              <input
                ref={photoInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
              <ImageIcon className="w-8 h-8 text-rose-gold/60 mx-auto mb-2" />
              <p className="font-body text-foreground font-medium text-sm">Upload Photos</p>
              <p className="text-xs text-muted-foreground font-body mt-1">
                {photoCount > 0 ? `${photoCount} selected` : 'Choose images'}
              </p>
            </label>
            <label className="block border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-rose-gold/50 transition-colors bg-card">
              <input
                ref={videoInputRef}
                type="file"
                multiple
                accept="video/*"
                onChange={handleVideoChange}
                className="hidden"
              />
              <VideoIcon className="w-8 h-8 text-rose-gold/60 mx-auto mb-2" />
              <p className="font-body text-foreground font-medium text-sm">Upload Videos</p>
              <p className="text-xs text-muted-foreground font-body mt-1">
                {videoCount > 0 ? `${videoCount} selected` : 'Choose videos'}
              </p>
            </label>
          </div>
          <p className="text-xs text-muted-foreground font-body text-center">
            Files are read one-by-one as they upload — keeps mobile snappy. Originals upload in the background.
          </p>
          {totalSelected > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-card border border-border px-4 py-3">
              <p className="text-sm font-body text-foreground">
                {totalSelected} file{totalSelected === 1 ? '' : 's'} ready to upload
              </p>
              <button
                onClick={clearSelection}
                className="text-xs font-body text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>
          )}
          {errorMessage && (
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-body text-foreground">
              {errorMessage}
            </div>
          )}
          <Button onClick={handleUploadClick} disabled={totalSelected === 0} className="w-full h-12 gradient-rose text-primary-foreground font-body font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            Upload to Unsorted
          </Button>
        </motion.div>
      )}

      <AlertDialog open={showLargeBatchWarning} onOpenChange={setShowLargeBatchWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Large upload detected</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              You've selected {totalSelected} files. For best results, upload in batches of {LARGE_BATCH_WARNING_THRESHOLD} files or less. Large weddings can be split across multiple uploads.
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
            {Math.max(totalSelected - failedCount - skippedCount - oversizeCount, 0)} file{totalSelected - failedCount === 1 ? '' : 's'} ready to browse
            {(skippedCount > 0 || oversizeCount > 0) && ` · ${skippedCount + oversizeCount} skipped`}
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
    // Single video load for both duration + poster (avoids double <video> element)
    const meta = await extractVideoMeta(file).catch(() => ({ duration: null, poster: null }));
    duration = meta.duration;
    previewBlob = meta.poster;
    if (duration !== null && duration < 3) flagReason = 'short_clip';
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


function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

export default UploadFlow;
