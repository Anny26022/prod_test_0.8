import React, { useEffect, useState } from 'react';
import { useTruePortfolio } from '../utils/TruePortfolioContext';
import { TruePortfolioSetup } from './TruePortfolioSetup';
import { WelcomeMessageModal } from './WelcomeMessageModal';
import { useAuth } from '../context/AuthContext';
import { SupabaseService } from '../services/supabaseService';

const USER_NAME_LOCAL_KEY = 'user_name';
const WELCOME_COMPLETE_LOCAL_KEY = 'welcome_complete';

interface TruePortfolioSetupManagerProps {
  userName: string;
  setUserName: React.Dispatch<React.SetStateAction<string>>;
}

export const TruePortfolioSetupManager: React.FC<TruePortfolioSetupManagerProps> = ({
  userName,
  setUserName
}) => {
  const { user } = useAuth();
  const { yearlyStartingCapitals } = useTruePortfolio();
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [hasCheckedSetup, setHasCheckedSetup] = useState(false);
  const [hasCompletedWelcome, setHasCompletedWelcome] = useState<boolean>(() => localStorage.getItem(WELCOME_COMPLETE_LOCAL_KEY) === 'true');
  const [hasExistingTrades, setHasExistingTrades] = useState<boolean | null>(null); // null = checking, true = has trades, false = no trades

  // Early return if user is not authenticated
  if (!user) {
    return null;
  }

  // Effect to check if user has existing trades in Supabase
  useEffect(() => {
    const checkForExistingTrades = async () => {
      if (!user) return;

      try {
        console.log('🔍 Checking for existing trades...');
        const trades = await SupabaseService.getAllTrades();
        const hasTradesInDb = trades.length > 0;
        setHasExistingTrades(hasTradesInDb);
        console.log(`📊 User has ${trades.length} existing trades in database`);
      } catch (error) {
        console.error('❌ Error checking for existing trades:', error);
        // On error, assume user has trades to avoid showing banner unnecessarily
        setHasExistingTrades(true);
      }
    };

    checkForExistingTrades();
  }, [user]);

  // Effect to load user name and welcome status on initial mount
  useEffect(() => {
    const storedUserName = localStorage.getItem(USER_NAME_LOCAL_KEY);
    if (storedUserName) {
      setUserName(storedUserName);
    }
    const storedWelcomeStatus = localStorage.getItem(WELCOME_COMPLETE_LOCAL_KEY);
    if (storedWelcomeStatus === 'true') {
      setHasCompletedWelcome(true);
    }
    setHasCheckedSetup(true); // Mark as checked after trying to load
  }, [setUserName]); // Add setUserName to dependency array

  // Check if initial setup is needed (yearly starting capital not set AND user has no existing trades)
  // This now runs only once after hydration and trade check is complete
  useEffect(() => {
    if (
      hasCheckedSetup &&
      hasExistingTrades === false && // Only show for users with NO existing trades
      yearlyStartingCapitals.length === 0 &&
      !isWelcomeModalOpen
    ) {
      console.log('🎉 New user detected - showing True Portfolio setup');
      setIsSetupModalOpen(true);
    } else if (hasExistingTrades === true) {
      console.log('👤 Existing user detected - skipping True Portfolio setup');
    }
  }, [yearlyStartingCapitals, hasCheckedSetup, isWelcomeModalOpen, hasExistingTrades]);

  // Handles closing the initial setup modal and opening the welcome message
  const handleSetupComplete = (name: string) => {
    setUserName(name);
    localStorage.setItem(USER_NAME_LOCAL_KEY, name);
    setIsSetupModalOpen(false);
    // Only show welcome message if it hasn't been completed before
    if (!hasCompletedWelcome) {
      setIsWelcomeModalOpen(true);
      localStorage.setItem(WELCOME_COMPLETE_LOCAL_KEY, 'true');
      setHasCompletedWelcome(true);
    }
  };

  // Don't render anything while we're still checking for existing trades
  if (hasExistingTrades === null) {
    return null;
  }

  return (
    <>
      <TruePortfolioSetup
        isOpen={isSetupModalOpen}
        onOpenChange={setIsSetupModalOpen}
        onSetupComplete={handleSetupComplete} // New prop for callback
        userName={userName}
        setUserName={setUserName}
      />
      <WelcomeMessageModal
        isOpen={isWelcomeModalOpen}
        onOpenChange={setIsWelcomeModalOpen}
        userName={userName}
      />
    </>
  );
};
