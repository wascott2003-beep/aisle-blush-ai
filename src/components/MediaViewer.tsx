import { motion } from 'framer-motion';
import { X, Trash2, Play, Pause, Image as ImageIcon, Film } from 'lucide-react';
import { MediaItem } from '@/lib/types';
import { useState, useRef } from 'react';

interface MediaViewerProps {
  item: MediaItem;
  onClose: () => void;
  onDelete: (id: string) => void;
}

const MediaViewer = ({ item, onClose, onDelete }: MediaViewerProps) => {
  const [playing, setPlaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        <X className="w-5 h-5 text-white" />
      </button>

      {/* Delete button */}
      {!confirmDelete ? (
        <button
          onClick={() => setConfirmDelete(true)}
          className="absolute top-4 left-4 z-50 w-10 h-10 rounded-full bg-white/10 hover:bg-destructive/80 flex items-center justify-center transition-colors"
        >
          <Trash2 className="w-4 h-4 text-white" />
        </button>
      ) : (
        <div className="absolute top-4 left-4 z-50 flex items-center gap-2 bg-destructive/90 rounded-full px-4 py-2">
          <span className="text-white text-sm font-body">Delete?</span>
          <button
            onClick={() => { onDelete(item.id); onClose(); }}
            className="text-white text-sm font-body font-semibold hover:underline"
          >
            Yes
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-white/70 text-sm font-body hover:underline"
          >
            No
          </button>
        </div>
      )}

      {/* Media content */}
      <div className="w-full h-full flex items-center justify-center p-8">
        {item.type === 'photo' ? (
          <div className="max-w-full max-h-full flex items-center justify-center">
            {hasRealMedia ? (
              <img src={item.url} alt={item.folder} className="max-w-full max-h-[80vh] rounded-2xl object-contain" />
            ) : (
              <div className="w-80 h-80 sm:w-[28rem] sm:h-[28rem] rounded-2xl bg-accent/10 border border-white/10 flex flex-col items-center justify-center gap-3">
                <ImageIcon className="w-16 h-16 text-white/20" />
                <p className="text-white/40 font-body text-sm">{item.folder}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="relative flex flex-col items-center gap-4">
            {hasRealMedia ? (
              <video
                ref={videoRef}
                src={item.url}
                className="max-w-full max-h-[70vh] rounded-2xl"
                onEnded={() => setPlaying(false)}
              />
            ) : (
              <div className="w-80 h-56 sm:w-[32rem] sm:h-[20rem] rounded-2xl bg-accent/10 border border-white/10 flex flex-col items-center justify-center gap-3">
                <Film className="w-16 h-16 text-white/20" />
                <p className="text-white/40 font-body text-sm">{item.folder}</p>
                {item.duration && (
                  <p className="text-white/30 font-body text-xs">{item.duration.toFixed(1)}s</p>
                )}
              </div>
            )}
            <button
              onClick={togglePlay}
              className="w-14 h-14 rounded-full bg-rose-gold hover:bg-rose-gold-dark flex items-center justify-center transition-colors"
            >
              {playing ? (
                <Pause className="w-6 h-6 text-white" />
              ) : (
                <Play className="w-6 h-6 text-white ml-0.5" />
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default MediaViewer;
