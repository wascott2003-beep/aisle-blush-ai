import { motion } from 'framer-motion';
import { Search, Calendar, Image as ImageIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Wedding } from '@/lib/types';
import { useState } from 'react';

interface WeddingLibraryProps {
  weddings: Wedding[];
  onSelectWedding: (id: string) => void;
}

const WeddingLibrary = ({ weddings, onSelectWedding }: WeddingLibraryProps) => {
  const [search, setSearch] = useState('');
  const filtered = weddings.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-semibold text-foreground">Wedding Library</h1>
        <p className="text-muted-foreground font-body mt-1">Browse all your wedding projects</p>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search weddings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11 bg-card border-border rounded-lg font-body"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((wedding, i) => (
          <motion.div
            key={wedding.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onSelectWedding(wedding.id)}
            className="bg-card rounded-xl border border-border p-4 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-rose-gold-light/40 transition-all"
          >
            <div className="w-16 h-16 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <ImageIcon className="w-6 h-6 text-rose-gold/40" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading font-medium text-foreground truncate">{wedding.name}</h3>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-body">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(wedding.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span>{wedding.mediaCount} files</span>
                <span>{wedding.folders.reduce((a, f) => a + f.items.length, 0)} sorted</span>
              </div>
            </div>
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground font-body py-12">No weddings found</p>
        )}
      </div>
    </div>
  );
};

export default WeddingLibrary;
