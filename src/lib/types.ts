export interface Wedding {
  id: string;
  name: string;
  date: string;
  thumbnail: string;
  mediaCount: number;
  folders: MediaFolder[];
  shortClips: MediaItem[];
}

export interface MediaFolder {
  name: string;
  icon: string;
  items: MediaItem[];
}

export interface MediaItem {
  id: string;
  type: 'photo' | 'video';
  url: string;
  thumbnail: string;
  duration?: number; // seconds, for video
  folder: string;
}

export type AppView = 'login' | 'dashboard' | 'wedding' | 'upload' | 'review' | 'settings';
