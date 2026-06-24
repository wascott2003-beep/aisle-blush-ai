import { useState, useEffect, useCallback } from 'react';
import LoginScreen from '@/components/LoginScreen';
import AppNav from '@/components/AppNav';
import Dashboard from '@/components/Dashboard';
import WeddingDetail from '@/components/WeddingDetail';
import UploadFlow from '@/components/UploadFlow';
import ReviewClips from '@/components/ReviewClips';
import ReelCreator from '@/components/ReelCreator';
import AccountSettings from '@/components/AccountSettings';
import WeddingLibrary from '@/components/WeddingLibrary';
import { Wedding, Vendor } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { fetchWeddings, deleteMediaItem, deleteMediaItems, saveVendor, deleteVendor, fetchPendingMediaForWedding } from '@/lib/supabase-helpers';
import { hydratePendingCount } from '@/lib/upload-queue';

type Page = 'dashboard' | 'library' | 'settings';

const Index = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [weddings, setWeddings] = useState<Wedding[]>([]);
  const [selectedWeddingId, setSelectedWeddingId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showAddMore, setShowAddMore] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showReel, setShowReel] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check auth state
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setLoggedIn(true);
      } else {
        setUserId(null);
        setLoggedIn(false);
      }
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        setLoggedIn(true);
      }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadWeddings = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchWeddings(userId);
      setWeddings(data);
      // Hydrate pending counts so the background-upload indicator reflects
      // any originals still pending from a previous session.
      for (const w of data) {
        try {
          const pending = await fetchPendingMediaForWedding(w.id);
          if (pending.length > 0) hydratePendingCount(w.id, pending.length);
        } catch (e) {
          console.warn('Failed to hydrate pending uploads for', w.id, e);
        }
      }
    } catch (err) {
      console.error('Failed to load weddings:', err);
    }
  }, [userId]);

  useEffect(() => {
    if (loggedIn && userId) loadWeddings();
  }, [loggedIn, userId, loadWeddings]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLoggedIn(false);
    setUserId(null);
    setWeddings([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-rose-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!loggedIn) {
    return <LoginScreen onLogin={() => {}} />;
  }

  const selectedWedding = weddings.find((w) => w.id === selectedWeddingId);

  if (showUpload) {
    return (
      <>
        <AppNav currentPage={page} onNavigate={(p) => { setPage(p); setShowUpload(false); }} onLogout={handleLogout} />
        <UploadFlow
          onBack={() => setShowUpload(false)}
          onComplete={async (weddingId) => {
            await loadWeddings();
            if (weddingId) setSelectedWeddingId(weddingId);
            setShowUpload(false);
          }}
        />
      </>
    );
  }

  if (showAddMore && selectedWedding) {
    return (
      <>
        <AppNav currentPage={page} onNavigate={(p) => { setPage(p); setShowAddMore(false); setSelectedWeddingId(null); }} onLogout={handleLogout} />
        <UploadFlow
          existingWeddingId={selectedWedding.id}
          existingWeddingName={selectedWedding.name}
          existingWeddingDate={selectedWedding.date}
          onBack={() => setShowAddMore(false)}
          onComplete={async () => {
            await loadWeddings();
            setShowAddMore(false);
          }}
        />
      </>
    );
  }

  if (showReview && selectedWedding) {
    return (
      <>
        <AppNav currentPage={page} onNavigate={(p) => { setPage(p); setShowReview(false); setSelectedWeddingId(null); }} onLogout={handleLogout} />
        <ReviewClips
          clips={selectedWedding.flaggedItems}
          weddingName={selectedWedding.name}
          onBack={() => setShowReview(false)}
          onComplete={async (kept, deleted) => {
            // Delete the items marked for deletion (DB rows + storage files)
            await deleteMediaItems(deleted);
            await loadWeddings();
            setShowReview(false);
          }}
        />
      </>
    );
  }

  if (showReel && selectedWedding) {
    return (
      <>
        <AppNav currentPage={page} onNavigate={(p) => { setPage(p); setShowReel(false); setSelectedWeddingId(null); }} onLogout={handleLogout} />
        <ReelCreator weddingId={selectedWedding.id} weddingName={selectedWedding.name} onBack={() => setShowReel(false)} />
      </>
    );
  }

  if (selectedWedding) {
    return (
      <>
        <AppNav currentPage={page} onNavigate={(p) => { setPage(p); setSelectedWeddingId(null); }} onLogout={handleLogout} />
        <WeddingDetail
          wedding={selectedWedding}
          onBack={() => setSelectedWeddingId(null)}
          onReview={() => setShowReview(true)}
          onCreateReel={() => setShowReel(true)}
          onAddMore={() => setShowAddMore(true)}
          onRefresh={loadWeddings}
          onDeleteItem={async (folderName, itemId) => {
            await deleteMediaItem(itemId);
            await loadWeddings();
          }}
          onDeleteItems={async (itemIds) => {
            await deleteMediaItems(itemIds);
            await loadWeddings();
          }}
          onUpdateVendors={async (vendors: Vendor[]) => {
            // Sync vendors: save all, delete removed
            const existingIds = selectedWedding.vendors.map((v) => v.id);
            const newIds = vendors.map((v) => v.id);
            const toDelete = existingIds.filter((id) => !newIds.includes(id));

            for (const id of toDelete) {
              await deleteVendor(id);
            }
            for (const v of vendors) {
              await saveVendor(selectedWedding.id, v);
            }
            await loadWeddings();
          }}
        />
      </>
    );
  }

  return (
    <>
      <AppNav currentPage={page} onNavigate={setPage} onLogout={handleLogout} />
      {page === 'dashboard' && (
        <Dashboard weddings={weddings} onSelectWedding={setSelectedWeddingId} onNewWedding={() => setShowUpload(true)} />
      )}
      {page === 'library' && (
        <WeddingLibrary weddings={weddings} onSelectWedding={(id) => { setSelectedWeddingId(id); setPage('dashboard'); }} />
      )}
      {page === 'settings' && <AccountSettings />}
    </>
  );
};

export default Index;
