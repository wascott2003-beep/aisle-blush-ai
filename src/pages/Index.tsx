import { useState } from 'react';
import LoginScreen from '@/components/LoginScreen';
import AppNav from '@/components/AppNav';
import Dashboard from '@/components/Dashboard';
import WeddingDetail from '@/components/WeddingDetail';
import UploadFlow from '@/components/UploadFlow';
import ReviewClips from '@/components/ReviewClips';
import AccountSettings from '@/components/AccountSettings';
import WeddingLibrary from '@/components/WeddingLibrary';
import { Wedding } from '@/lib/types';
import { mockWeddings } from '@/lib/mock-data';

type Page = 'dashboard' | 'library' | 'settings';

const Index = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [page, setPage] = useState<Page>('dashboard');
  const [weddings, setWeddings] = useState<Wedding[]>(mockWeddings);
  const [selectedWeddingId, setSelectedWeddingId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showReview, setShowReview] = useState(false);

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  const selectedWedding = weddings.find((w) => w.id === selectedWeddingId);

  if (showUpload) {
    return (
      <>
        <AppNav currentPage={page} onNavigate={setPage} onLogout={() => setLoggedIn(false)} />
        <UploadFlow
          onBack={() => setShowUpload(false)}
          onComplete={(wedding) => {
            setWeddings((prev) => [wedding, ...prev]);
            setSelectedWeddingId(wedding.id);
            setShowUpload(false);
          }}
        />
      </>
    );
  }

  if (showReview && selectedWedding) {
    return (
      <>
        <AppNav currentPage={page} onNavigate={(p) => { setPage(p); setShowReview(false); setSelectedWeddingId(null); }} onLogout={() => setLoggedIn(false)} />
        <ReviewClips
          clips={selectedWedding.shortClips}
          weddingName={selectedWedding.name}
          onBack={() => setShowReview(false)}
          onComplete={(kept, deleted) => {
            setWeddings((prev) =>
              prev.map((w) =>
                w.id === selectedWedding.id
                  ? { ...w, shortClips: w.shortClips.filter((c) => kept.includes(c.id)) }
                  : w
              )
            );
            setShowReview(false);
          }}
        />
      </>
    );
  }

  if (selectedWedding) {
    return (
      <>
        <AppNav currentPage={page} onNavigate={(p) => { setPage(p); setSelectedWeddingId(null); }} onLogout={() => setLoggedIn(false)} />
        <WeddingDetail
          wedding={selectedWedding}
          onBack={() => setSelectedWeddingId(null)}
          onReview={() => setShowReview(true)}
        />
      </>
    );
  }

  return (
    <>
      <AppNav currentPage={page} onNavigate={setPage} onLogout={() => setLoggedIn(false)} />
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
