import React, { useRef, useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { Icon } from "@iconify/react";
import { Route, Switch, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@heroui/react";
import { ThemeSwitcher } from "./components/theme-switcher";
import { useTheme } from "@heroui/use-theme";
import { TruePortfolioProvider } from "./utils/TruePortfolioContext";
import { TruePortfolioSetupManager } from "./components/TruePortfolioSetupManager";
import { ProfileSettingsModal } from "./components/ProfileSettingsModal";
import { GlobalFilterProvider, useGlobalFilter } from "./context/GlobalFilterContext";
import { AccountingMethodProvider } from "./context/AccountingMethodContext";
import { GlobalFilterBar } from "./components/GlobalFilterBar";
import { TradeTrackerLogo } from './components/icons/TradeTrackerLogo';
import { AnimatedBrandName } from './components/AnimatedBrandName';
import ErrorBoundary from "./components/ErrorBoundary";
import { Analytics } from '@vercel/analytics/react';
import { Loader } from "./components/Loader";

// Lazy load heavy components for better performance with preloading
const TradeJournal = React.lazy(() => import("./components/trade-journal").then(module => ({ default: module.TradeJournal })));
const TradeAnalytics = React.lazy(() => import("./components/trade-analytics").then(module => ({ default: module.TradeAnalytics })));
const TaxAnalytics = React.lazy(() => import("./components/tax-analytics").then(module => ({ default: module.TaxAnalytics })));
const MonthlyPerformanceTable = React.lazy(() => import("./pages/monthly-performance").then(module => ({ default: module.MonthlyPerformanceTable })));
const DeepAnalyticsPage = React.lazy(() => import("./pages/DeepAnalyticsPage"));

// Preload components for faster navigation
const preloadComponents = () => {
  // Preload most commonly accessed components
  import("./components/trade-analytics");
  import("./components/tax-analytics");
  import("./pages/monthly-performance");
};

// Authentication and Migration
import { AuthProvider, useAuth, useUser } from "./context/AuthContext";
import { AuthGuard } from "./components/auth/AuthGuard";
import { MigrationModal } from "./components/migration/MigrationModal";
import { MigrationService } from "./services/migrationService";
import { SupabaseService } from "./services/supabaseService";
import { DatabaseService } from "./db/database";
import { AuthDebug } from "./components/debug/AuthDebug";
import { AuthModal } from "./components/auth/AuthModal";
import { AuthCallback } from "./pages/AuthCallback";
import { PasswordResetPage } from "./components/auth/PasswordResetPage";
import { ToastProvider } from "./components/ToastProvider";
// Migrated from IndexedDB to Supabase with authentication

// Main App Content Component (authenticated users only)
function AppContent() {
  const location = useLocation();
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [userName, setUserName] = React.useState('');
  const [loadingPrefs, setLoadingPrefs] = React.useState(true);
  const [isFullWidthEnabled, setIsFullWidthEnabled] = React.useState(false);
  const [showMigrationModal, setShowMigrationModal] = React.useState(false);
  const [showAuthModal, setShowAuthModal] = React.useState(false);
  const [migrationChecked, setMigrationChecked] = React.useState(false);

  const mainContentRef = useRef<HTMLElement>(null);
  const [isMainContentFullscreen, setIsMainContentFullscreen] = useState(false);

  const getDefaultUserName = () => {
    // Use user's name from auth or fallback
    return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  };

  // Check for migration on first load
  useEffect(() => {
    const checkForMigration = async () => {
      if (!migrationChecked) {
        // Check if user has completed migration or chosen "never show again"
        const migrationCompleted = localStorage.getItem(`migration_completed_${user?.id}`) === 'true';
        const neverShowAgain = localStorage.getItem(`migration_never_show_${user?.id}`) === 'true';

        if (!migrationCompleted && !neverShowAgain) {
          const hasDataToMigrate = await MigrationService.hasDataToMigrate();
          if (hasDataToMigrate) {
            setShowMigrationModal(true);
          }
        }
        setMigrationChecked(true);
      }
    };

    if (user) {
      checkForMigration();
    }
  }, [user, migrationChecked]);

  // Memoize Supabase helper functions to prevent re-creation on every render
  const fetchUserPreferences = useCallback(async () => {
    try {
      const prefs = await SupabaseService.getUserPreferences();
      return prefs;
    } catch (error) {
      return null;
    }
  }, []);

  const saveUserPreferences = useCallback(async (prefs: Partial<{ is_mobile_menu_open: boolean; is_profile_open: boolean; user_name: string; is_full_width_enabled: boolean }>) => {
    try {
      const existing = await fetchUserPreferences() || {};
      const updated = { ...existing, ...prefs };
      await SupabaseService.saveUserPreferences(updated);
    } catch (error) {
      }
  }, [fetchUserPreferences]);

  React.useEffect(() => {
    // Load preferences from Supabase on mount
    const loadPreferences = async () => {
      try {
        const prefs = await fetchUserPreferences();
        if (prefs) {
          setIsMobileMenuOpen(!!prefs.is_mobile_menu_open);
          setIsProfileOpen(!!prefs.is_profile_open);
          setUserName(prefs.user_name || getDefaultUserName());
          setIsFullWidthEnabled(!!prefs.is_full_width_enabled);
        } else {
          // Set default values for new users
          setUserName(getDefaultUserName());
        }
      } catch (error) {
        // Set default values on error
        setUserName(getDefaultUserName());
      } finally {
        setLoadingPrefs(false);
      }
    };

    if (user) {
      loadPreferences();
    }
  }, [fetchUserPreferences, user]);

  React.useEffect(() => {
    if (!loadingPrefs) {
      saveUserPreferences({ is_mobile_menu_open: isMobileMenuOpen });
    }
  }, [isMobileMenuOpen, loadingPrefs, saveUserPreferences]);

  React.useEffect(() => {
    if (!loadingPrefs) {
      saveUserPreferences({ is_profile_open: isProfileOpen });
    }
  }, [isProfileOpen, loadingPrefs, saveUserPreferences]);

  React.useEffect(() => {
    if (!loadingPrefs) {
      saveUserPreferences({ user_name: userName });
    }
  }, [userName, loadingPrefs, saveUserPreferences]);

  React.useEffect(() => {
    if (!loadingPrefs) {
      saveUserPreferences({ is_full_width_enabled: isFullWidthEnabled });
    }
  }, [isFullWidthEnabled, loadingPrefs, saveUserPreferences]);

  const handleToggleMainContentFullscreen = () => {
    if (!document.fullscreenElement) {
      mainContentRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsMainContentFullscreen(document.fullscreenElement === mainContentRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // PERFORMANCE OPTIMIZATION: Preload components after initial render
  React.useEffect(() => {
    // Preload components after a short delay to not block initial render
    const timer = setTimeout(() => {
      preloadComponents();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Memoize navigation items to prevent unnecessary re-renders
  const navItems = useMemo(() => [
    { path: "/", name: "Journal", icon: "lucide:book-open" },
    { path: "/analytics", name: "Analytics", icon: "lucide:bar-chart-2" },
    { path: "/tax-analytics", name: "Tax Analytics", icon: "lucide:calculator" },
    { path: "/monthly-performance", name: "Monthly Performance", icon: "lucide:calendar-check" },
    { path: "/deep-analytics", name: "Deep Analytics", icon: "lucide:pie-chart" }
  ], []);

  return (
    <TruePortfolioProvider>
      <AccountingMethodProvider>
        <GlobalFilterProvider>
          <div className="min-h-screen bg-background font-sans antialiased">
          {/* Navigation */}
          <header className="sticky top-0 z-40 w-full border-b border-gray-200 dark:border-gray-700 bg-background/80 backdrop-blur-xl backdrop-saturate-150">
            <nav className="px-4 sm:px-6">
              <div className="flex h-16 items-center justify-between">
                {/* Logo and Mobile Menu Button */}
                <div className="flex items-center gap-4">
                  <Link
                    to="/"
                    className="flex items-center gap-2 font-semibold tracking-tight text-foreground hover:opacity-90 transition-opacity"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-foreground"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Outer circle */}
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      {/* Diamond/gem shape */}
                      <path
                        d="M12 6L16 10L12 18L8 10L12 6Z"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="0.5"
                        strokeLinejoin="round"
                      />
                      {/* Inner diamond lines */}
                      <path
                        d="M8 10L12 14L16 10"
                        stroke="currentColor"
                        strokeWidth="0.5"
                        fill="none"
                        opacity="0.7"
                      />
                    </svg>
                    <AnimatedBrandName className="text-foreground" />
                  </Link>
                  <Button
                    isIconOnly
                    variant="light"
                    size="sm"
                    onPress={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="sm:hidden"
                  >
                    <Icon icon={isMobileMenuOpen ? "lucide:x" : "lucide:menu"} className="h-5 w-5" />
                  </Button>
                </div>

                {/* Desktop Navigation */}
                <div className="hidden sm:flex sm:items-center sm:gap-8">
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors rounded-lg
                          ${isActive
                            ? 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30 backdrop-blur-md shadow-md'
                            : 'text-gray-700 dark:text-gray-300 hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800/50 backdrop-blur-sm transition-all duration-300'
                          }`}
                      >
                        <Icon icon={item.icon} className="h-4 w-4" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>

                {/* Right Side Actions */}
                <div className="flex items-center gap-3">
                  <ThemeSwitcher />
                  {user ? (
                    <>
                      <Button
                        variant="flat"
                        size="sm"
                        onPress={() => setIsProfileOpen(true)}
                        className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/20 transition-all duration-300 min-h-0 min-w-0 shadow-sm"
                        startContent={<Icon icon="lucide:user" className="h-4 w-4" />}
                      >
                        <span className="font-medium text-sm leading-none">{userName}</span>
                      </Button>
                      <Button
                        isIconOnly
                        variant="light"
                        size="sm"
                        onPress={signOut}
                        className="hidden sm:flex hover:bg-red-100 dark:hover:bg-red-900/20 transition-all duration-300"
                      >
                        <Icon icon="lucide:log-out" className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="flat"
                      size="sm"
                      onPress={() => setShowAuthModal(true)}
                      className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/20 transition-all duration-300 min-h-0 min-w-0 shadow-sm"
                      startContent={<Icon icon="lucide:log-in" className="h-4 w-4" />}
                    >
                      <span className="font-medium text-sm leading-none">Sign In</span>
                    </Button>
                  )}
                </div>
              </div>
            </nav>

            {/* Mobile Navigation */}
            <AnimatePresence>
              {isMobileMenuOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="sm:hidden border-t border-divider overflow-hidden"
                >
                  <div className="space-y-1 px-4 py-3 bg-background/30 backdrop-blur-xl">
                    {navItems.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors rounded-lg
                          ${isActive
                            ? 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30 backdrop-blur-md shadow-md'
                            : 'text-gray-700 dark:text-gray-300 hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800/50 backdrop-blur-sm transition-all duration-300'
                          }`}
                        >
                          <Icon icon={item.icon} className="h-4 w-4" />
                          {item.name}
                        </Link>
                      );
                    })}
                    {user ? (
                      <>
                        {/* Profile Button for Mobile */}
                        <Button
                          variant="light"
                          size="sm"
                          onPress={() => {
                            setIsProfileOpen(true);
                            setIsMobileMenuOpen(false); // Close mobile menu when opening profile
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors rounded-lg text-gray-700 dark:text-gray-300 hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800/50 backdrop-blur-sm transition-all duration-300"
                          startContent={<Icon icon="lucide:user" className="h-4 w-4" />}
                        >
                          <span>{userName || 'Profile'}</span>
                        </Button>
                        {/* Sign Out Button for Mobile */}
                        <Button
                          isIconOnly
                          variant="light"
                          size="sm"
                          onPress={() => {
                            signOut();
                            setIsMobileMenuOpen(false);
                          }}
                          className="flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 transition-all duration-300"
                        >
                          <Icon icon="lucide:log-out" className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="light"
                        size="sm"
                        onPress={() => {
                          setShowAuthModal(true);
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors rounded-lg text-gray-700 dark:text-gray-300 hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800/50 backdrop-blur-sm transition-all duration-300"
                        startContent={<Icon icon="lucide:log-in" className="h-4 w-4" />}
                      >
                        <span>Sign In</span>
                      </Button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </header>

          {/* Global Filter Bar */}
          <GlobalFilterBar />

          {/* Main Content */}
          <main ref={mainContentRef} className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
            <ErrorBoundary>
              <div className={isFullWidthEnabled ? "py-6" : "max-w-7xl mx-auto py-6"}>
                <Suspense fallback={<Loader />}>
                  <Switch>
                    <Route path="/auth/callback">
                      <AuthCallback />
                    </Route>
                    <Route path="/auth/reset-password">
                      <PasswordResetPage />
                    </Route>
                    <Route path="/analytics">
                      <TradeAnalytics />
                    </Route>
                    <Route exact path="/" render={(props) => (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <TradeJournal {...props} toggleFullscreen={handleToggleMainContentFullscreen} isFullscreen={isMainContentFullscreen} />
                      </motion.div>
                    )} />
                    <Route path="/tax-analytics" component={TaxAnalytics} />
                    <Route path="/monthly-performance" component={MonthlyPerformanceTable} />
                    <Route path="/deep-analytics" component={DeepAnalyticsPage} />
                  </Switch>
                </Suspense>
              </div>
            </ErrorBoundary>
          </main>

          <ProfileSettingsModal
            isOpen={isProfileOpen}
            onOpenChange={setIsProfileOpen}
            userName={userName}
            setUserName={setUserName}
            isFullWidthEnabled={isFullWidthEnabled}
            setIsFullWidthEnabled={setIsFullWidthEnabled}
          />

          {/* Only show TruePortfolio setup for authenticated users */}
          {user && (
            <TruePortfolioSetupManager
              userName={userName}
              setUserName={setUserName}
            />
          )}

          {/* Migration Modal - Only for authenticated users */}
          {user && (
            <MigrationModal
              isOpen={showMigrationModal}
              onClose={() => {
                // Just close the modal - don't mark as dismissed
                // User will see it again next time if they still have data
                setShowMigrationModal(false);
              }}
              onMigrationComplete={() => {
                // Mark migration as completed for this user
                if (user?.id) {
                  localStorage.setItem(`migration_completed_${user.id}`, 'true');
                }
                setShowMigrationModal(false);
                // Optionally refresh the page or reload data
                window.location.reload();
              }}
              onNeverShowAgain={() => {
                // Mark as "never show again" for this user
                if (user?.id) {
                  localStorage.setItem(`migration_never_show_${user.id}`, 'true');
                }
                setShowMigrationModal(false);
              }}
            />
          )}

          <Analytics />
          {/* <AuthDebug /> */}

          {/* Auth Modal for Guest Users */}
          {showAuthModal && (
            <AuthModal
              isOpen={showAuthModal}
              onClose={() => setShowAuthModal(false)}
            />
          )}
          </div>
        </GlobalFilterProvider>
      </AccountingMethodProvider>
    </TruePortfolioProvider>
  );
}

// Main App Component with Authentication
export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGuard>
          <AppContent />
        </AuthGuard>
      </AuthProvider>
    </ToastProvider>
  );
}