import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, Globe, X, Store, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Vendor, VendorType, VENDOR_TYPES } from '@/lib/types';

interface VendorSectionProps {
  vendors: Vendor[];
  onUpdate: (vendors: Vendor[]) => void;
}

const emptyForm = { type: '' as VendorType, businessName: '', instagram: '', website: '' };

const VendorSection = ({ vendors, onUpdate }: VendorSectionProps) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const openEdit = (v: Vendor) => {
    setForm({ type: v.type, businessName: v.businessName, instagram: v.instagram, website: v.website || '' });
    setEditingId(v.id);
    setShowForm(true);
  };
  const close = () => { setShowForm(false); setEditingId(null); };

  const save = () => {
    if (!form.type || !form.businessName.trim() || !form.instagram.trim()) return;
    const vendor: Vendor = {
      id: editingId || crypto.randomUUID(),
      type: form.type,
      businessName: form.businessName.trim(),
      instagram: form.instagram.trim().replace(/^@/, ''),
      website: form.website.trim() || undefined,
    };
    if (editingId) {
      onUpdate(vendors.map((v) => (v.id === editingId ? vendor : v)));
    } else {
      onUpdate([...vendors, vendor]);
    }
    close();
  };

  const remove = (id: string) => onUpdate(vendors.filter((v) => v.id !== id));

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-heading font-semibold text-foreground">Vendors</h2>
        <Button onClick={openAdd} variant="outline" size="sm" className="border-rose-gold text-rose-gold hover:bg-accent font-body">
          <Plus className="w-4 h-4 mr-1" /> Add Vendor
        </Button>
      </div>

      {/* Form Dialog */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-medium text-foreground">{editingId ? 'Edit Vendor' : 'Add Vendor'}</h3>
                <button onClick={close} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-body text-xs text-muted-foreground">Vendor Type *</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as VendorType })}>
                    <SelectTrigger className="font-body"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {VENDOR_TYPES.map((t) => <SelectItem key={t} value={t} className="font-body">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-body text-xs text-muted-foreground">Business Name *</Label>
                  <Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="Studio name" className="font-body" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-body text-xs text-muted-foreground">Instagram Handle *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="handle" className="pl-7 font-body" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-body text-xs text-muted-foreground">Website (optional)</Label>
                  <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." className="font-body" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={close} className="font-body">Cancel</Button>
                <Button size="sm" onClick={save} disabled={!form.type || !form.businessName.trim() || !form.instagram.trim()} className="bg-rose-gold hover:bg-rose-gold/90 text-white font-body">
                  {editingId ? 'Save Changes' : 'Add Vendor'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vendor Cards */}
      {vendors.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground font-body">
          <Store className="w-10 h-10 mb-2 opacity-40" />
          <p className="text-sm">No vendors added yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((v, i) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-xl p-4 hover:border-rose-gold-light/40 transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-[11px] font-body font-medium uppercase tracking-wider text-rose-gold bg-rose-gold/10 px-2 py-0.5 rounded-full">
                  {v.type}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(v)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(v.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <h4 className="font-heading font-medium text-foreground text-sm">{v.businessName}</h4>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-body">
                <a href={`https://instagram.com/${v.instagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-rose-gold transition-colors">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1.5" /></svg> @{v.instagram}
                </a>
                {v.website && (
                  <a href={v.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-rose-gold transition-colors">
                    <Globe className="w-3.5 h-3.5" /> Website
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VendorSection;
