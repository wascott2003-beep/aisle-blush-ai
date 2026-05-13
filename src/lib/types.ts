export const VENDOR_TYPES = [
  'Photographer', 'Videographer', 'Florist', 'Planner & Coordinator',
  'Venue', 'Hair & Makeup', 'DJ & Music', 'Catering',
  'Wedding Dress', 'Cake & Desserts', 'Other',
] as const;

export type VendorType = typeof VENDOR_TYPES[number];

export interface Vendor {
  id: string;
  type: VendorType;
  businessName: string;
  instagram: string;
  website?: string;
}

export type ProjectType = 'wedding' | 'event';

export interface Wedding {
  id: string;
  name: string;
  date: string;
  type: ProjectType;
  thumbnail: string;
  mediaCount: number;
  folders: MediaFolder[];
  shortClips: MediaItem[];
  flaggedItems: MediaItem[];
  vendors: Vendor[];
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
  flagReason?: 'short_clip' | 'low_quality_photo';
  uploadStatus?: 'pending' | 'complete' | 'failed';
}

export type AppView = 'login' | 'dashboard' | 'wedding' | 'upload' | 'review' | 'settings';
