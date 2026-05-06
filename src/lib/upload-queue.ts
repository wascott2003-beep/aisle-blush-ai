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
  canceledByWedding: Record<string, number>;
}

type Listener = (s: State) => void;

const queue: QueueJob[] = [];
// Stash of jobs the user canceled, keyed by weddingId, so they can be retried.
const canceledByWedding: Record<string, QueueJob[]> = {};
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
  canceledByWedding: {},
};

function emit() {
  listeners.forEach((l) =>
    l({
      ...state,
      pendingByWedding: { ...state.pendingByWedding },
      canceledByWedding: { ...state.canceledByWedding },
    }),
  );
}

function bumpWedding(weddingId: string, delta: number) {
  const next = (state.pendingByWedding[weddingId] || 0) + delta;
  if (next <= 0) delete state.pendingByWedding[weddingId];
  else state.pendingByWedding[weddingId] = next;
}

export function subscribeUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener({
    ...state,
    pendingByWedding: { ...state.pendingByWedding },
    canceledByWedding: { ...state.canceledByWedding },
  });
  return () => listeners.delete(listener);
}

export function getPendingCountForWedding(weddingId: string): number {
  return state.pendingByWedding[weddingId] || 0;
}

// Seed pending counts from the database (e.g. on app open) without enqueuing
// actual file uploads. This makes the indicator reflect originals that were
// still pending from a previous session.
export function hydratePendingCount(weddingId: string, count: number) {
  const current = state.pendingByWedding[weddingId] || 0;
  if (count > current) {
    state.pendingByWedding[weddingId] = count;
    emit();
  }
}

export function enqueueUpload(job: QueueJob) {
  queue.push(job);
  state.total += 1;
  bumpWedding(job.weddingId, 1);
  emit();
  void runLoop();
}

// Cancel every pending upload for a given wedding. The job currently being
// uploaded (already in flight) cannot be aborted — supabase-js v2 doesn't
// expose an AbortSignal for storage uploads — so it will finish, but no
// further jobs for this wedding will start. Removed jobs are stashed so the
// user can hit Retry to put them back into the queue. Returns the number of
// jobs removed from the queue.
export function cancelUploadsForWedding(weddingId: string): number {
  const stash: QueueJob[] = canceledByWedding[weddingId] ? [...canceledByWedding[weddingId]] : [];
  let removed = 0;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].weddingId === weddingId) {
      stash.unshift(queue[i]); // preserve original order
      queue.splice(i, 1);
      removed += 1;
    }
  }
  if (removed > 0) {
    canceledByWedding[weddingId] = stash;
    // Reflect the cancellation in the per-wedding pending counter so the
    // indicator dismisses immediately.
    const current = state.pendingByWedding[weddingId] || 0;
    const next = Math.max(current - removed, 0);
    if (next === 0) delete state.pendingByWedding[weddingId];
    else state.pendingByWedding[weddingId] = next;
    state.canceledByWedding[weddingId] = stash.length;
    // Decrement the global total so the "X of Y" label stays accurate.
    state.total = Math.max(state.total - removed, state.completed + state.failed);
    emit();
  }
  return removed;
}

// Re-enqueue every job that was canceled for a wedding. Returns the number
// of jobs put back into the queue.
export function retryCanceledForWedding(weddingId: string): number {
  const stash = canceledByWedding[weddingId];
  if (!stash || stash.length === 0) return 0;
  const jobs = [...stash];
  delete canceledByWedding[weddingId];
  delete state.canceledByWedding[weddingId];
  for (const job of jobs) {
    queue.push(job);
    state.total += 1;
    bumpWedding(job.weddingId, 1);
  }
  emit();
  void runLoop();
  return jobs.length;
}

export function getCanceledCountForWedding(weddingId: string): number {
  return state.canceledByWedding[weddingId] || 0;
}

// Upload one file at a time to avoid overwhelming mobile connections.
const BATCH_SIZE = 2;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

async function processJob(job: QueueJob) {
  state.currentName = job.file.name;
  emit();

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential back-off: 2s, 4s, 8s
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        console.log(`Retrying ${job.file.name} (attempt ${attempt + 1}) in ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
        state.currentName = `${job.file.name} (retry ${attempt})`;
        emit();
      }

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
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) {
    console.error('Background upload failed after retries:', job.file.name, lastErr);
    state.failed += 1;
    try {
      await updateMediaItemStatus(job.mediaId, { upload_status: 'failed' });
    } catch {
      /* noop */
    }
  }

  bumpWedding(job.weddingId, -1);
  emit();
}

async function runLoop() {
  if (running) return;
  running = true;
  state.status = 'uploading';
  emit();

  while (queue.length > 0) {
    const batch = queue.splice(0, BATCH_SIZE);
    state.currentName = batch.length === 1 ? batch[0].file.name : `${batch.length} files`;
    state.currentProgress = 0;
    emit();
    await Promise.allSettled(batch.map(processJob));
    state.currentProgress = 1;
    emit();
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
