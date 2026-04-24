// Singleton background upload queue.
// Holds pending File blobs in memory and uploads them one at a time so the
// UI stays responsive on cellular connections. The corresponding media_items
// row already exists with upload_status='pending' and a preview thumbnail,
// so the user sees content immediately. When the original finishes, we
// patch the row's storage_path and flip status to 'complete'.

import { uploadMediaFile, updateMediaItemStatus } from '@/lib/supabase-helpers';

export interface QueueJob {
  mediaId: string;
  weddingId: string;
  folder: string;
  file: File;
  ext: string;
}

type Status = 'idle' | 'uploading';

interface State {
  status: Status;
  total: number;
  completed: number;
  failed: number;
  currentName: string | null;
  currentProgress: number; // 0-1 (best-effort; supabase-js v2 doesn't expose progress, so 0 or 1)
  pendingByWedding: Record<string, number>;
}

type Listener = (s: State) => void;

const queue: QueueJob[] = [];
const listeners = new Set<Listener>();
let running = false;

const state: State = {
  status: 'idle',
  total: 0,
  completed: 0,
  failed: 0,
  currentName: null,
  currentProgress: 0,
  pendingByWedding: {},
};

function emit() {
  listeners.forEach((l) => l({ ...state, pendingByWedding: { ...state.pendingByWedding } }));
}

function bumpWedding(weddingId: string, delta: number) {
  const next = (state.pendingByWedding[weddingId] || 0) + delta;
  if (next <= 0) delete state.pendingByWedding[weddingId];
  else state.pendingByWedding[weddingId] = next;
}

export function subscribeUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...state, pendingByWedding: { ...state.pendingByWedding } });
  return () => listeners.delete(listener);
}

export function getPendingCountForWedding(weddingId: string): number {
  return state.pendingByWedding[weddingId] || 0;
}

export function enqueueUpload(job: QueueJob) {
  queue.push(job);
  state.total += 1;
  bumpWedding(job.weddingId, 1);
  emit();
  void runLoop();
}

async function runLoop() {
  if (running) return;
  running = true;
  state.status = 'uploading';
  emit();

  while (queue.length > 0) {
    const job = queue.shift()!;
    state.currentName = job.file.name;
    state.currentProgress = 0;
    emit();

    try {
      const { storagePath } = await uploadMediaFile(
        job.weddingId,
        job.file,
        job.folder,
        job.ext,
        'original',
      );
      await updateMediaItemStatus(job.mediaId, {
        storage_path: storagePath,
        upload_status: 'complete',
      });
      state.completed += 1;
    } catch (err) {
      console.error('Background upload failed:', job.file.name, err);
      state.failed += 1;
      try {
        await updateMediaItemStatus(job.mediaId, { upload_status: 'failed' });
      } catch {
        /* noop */
      }
    } finally {
      bumpWedding(job.weddingId, -1);
      state.currentProgress = 1;
      emit();
    }
  }

  state.status = 'idle';
  state.currentName = null;
  state.currentProgress = 0;
  // Reset counters once everything settles so the next batch starts fresh.
  setTimeout(() => {
    if (state.status === 'idle' && queue.length === 0) {
      state.total = 0;
      state.completed = 0;
      state.failed = 0;
      emit();
    }
  }, 4000);
  emit();
  running = false;
}
