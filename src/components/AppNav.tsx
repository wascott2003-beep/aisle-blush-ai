import { LayoutDashboard, Library, Settings, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '@/assets/aisle-logo.png';

type NavPage = 'dashboard' | 'library' | 'settings';

interface AppNavProps {
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  onLogout: () => void;
}

const navItems = [
  { id: 'dashboard' as NavPage, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'library' as NavPage, label: 'Library', icon: Library },
  { id: 'settings' as NavPage, label: 'Settings', icon: Settings },
];

const AppNav = ({ currentPage, onNavigate, onLogout }: AppNavProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img src={logo} alt="Aisle AI" className="w-8 h-8" />
              <span className="font-heading text-xl font-semibold text-foreground">
                Aisle <span className="text-gradient-rose">AI</span>
              </span>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-body font-medium transition-colors ${
                    currentPage === item.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-body font-medium text-muted-foreground hover:text-destructive hover:bg-muted transition-colors ml-2"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile toggle */}
            <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-card border-b border-border z-40"
          >
            <div className="px-4 py-3 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-body font-medium transition-colors ${
                    currentPage === item.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
              <button
                onClick={onLogout}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-body font-medium text-destructive hover:bg-muted transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AppNav;
