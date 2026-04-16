import { Wedding } from './types';

const placeholderThumb = '/placeholder.svg';

export const mockWeddings: Wedding[] = [
  {
    id: '1',
    name: 'Sarah & James',
    date: '2025-06-14',
    thumbnail: placeholderThumb,
    mediaCount: 342,
    folders: [
      { name: 'Getting Ready', icon: 'Sparkles', items: Array.from({ length: 48 }, (_, i) => ({ id: `gr-${i}`, type: 'photo', url: placeholderThumb, thumbnail: placeholderThumb, folder: 'Getting Ready' })) },
      { name: 'Ceremony', icon: 'Heart', items: Array.from({ length: 65 }, (_, i) => ({ id: `ce-${i}`, type: 'photo', url: placeholderThumb, thumbnail: placeholderThumb, folder: 'Ceremony' })) },
      { name: 'Portraits', icon: 'Camera', items: Array.from({ length: 80 }, (_, i) => ({ id: `po-${i}`, type: 'photo', url: placeholderThumb, thumbnail: placeholderThumb, folder: 'Portraits' })) },
      { name: 'Reception', icon: 'PartyPopper', items: Array.from({ length: 95 }, (_, i) => ({ id: `re-${i}`, type: 'photo', url: placeholderThumb, thumbnail: placeholderThumb, folder: 'Reception' })) },
      { name: 'Details', icon: 'Gem', items: Array.from({ length: 34 }, (_, i) => ({ id: `de-${i}`, type: 'photo', url: placeholderThumb, thumbnail: placeholderThumb, folder: 'Details' })) },
      { name: 'Miscellaneous', icon: 'FolderOpen', items: Array.from({ length: 20 }, (_, i) => ({ id: `mi-${i}`, type: 'photo', url: placeholderThumb, thumbnail: placeholderThumb, folder: 'Miscellaneous' })) },
    ],
    shortClips: [
      { id: 'sc-1', type: 'video', url: placeholderThumb, thumbnail: placeholderThumb, duration: 1.2, folder: 'Ceremony' },
      { id: 'sc-2', type: 'video', url: placeholderThumb, thumbnail: placeholderThumb, duration: 2.1, folder: 'Reception' },
      { id: 'sc-3', type: 'video', url: placeholderThumb, thumbnail: placeholderThumb, duration: 0.8, folder: 'Getting Ready' },
    ],
  },
  {
    id: '2',
    name: 'Emily & David',
    date: '2025-05-22',
    thumbnail: placeholderThumb,
    mediaCount: 278,
    folders: [
      { name: 'Getting Ready', icon: 'Sparkles', items: [] },
      { name: 'Ceremony', icon: 'Heart', items: [] },
      { name: 'Portraits', icon: 'Camera', items: [] },
      { name: 'Reception', icon: 'PartyPopper', items: [] },
      { name: 'Details', icon: 'Gem', items: [] },
      { name: 'Miscellaneous', icon: 'FolderOpen', items: [] },
    ],
    shortClips: [],
  },
  {
    id: '3',
    name: 'Olivia & Michael',
    date: '2025-04-10',
    thumbnail: placeholderThumb,
    mediaCount: 456,
    folders: [
      { name: 'Getting Ready', icon: 'Sparkles', items: [] },
      { name: 'Ceremony', icon: 'Heart', items: [] },
      { name: 'Portraits', icon: 'Camera', items: [] },
      { name: 'Reception', icon: 'PartyPopper', items: [] },
      { name: 'Details', icon: 'Gem', items: [] },
      { name: 'Miscellaneous', icon: 'FolderOpen', items: [] },
    ],
    shortClips: [
      { id: 'sc-4', type: 'video', url: placeholderThumb, thumbnail: placeholderThumb, duration: 1.5, folder: 'Details' },
    ],
  },
];
