import React, { useState, useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { notificationService } from '../../services/notificationService';

export const PasswordResetPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);
  const history = useHistory();
  const location = useLocation();

  useEffect(() => {
    // Parse URL parameters manually for older React Router
    const urlParams = new URLSearchParams(location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');

    if (accessToken && refreshToken) {
      // Set the session with the tokens from the URL
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(({ error }) => {
        if (error) {
          console.error('Error setting session:', error);
          notificationService.error('Invalid or expired reset link');
          history.push('/');
        } else {
          setIsValidToken(true);
        }
      });
    } else {
      notificationService.error('Invalid reset link');
      history.push('/');
    }
  }, [location.search, history]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password || !confirmPassword) {
      notificationService.error('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      notificationService.error('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      notificationService.error('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        notificationService.error('Failed to update password. Please try again.');
      } else {
        notificationService.success('Password updated successfully!\n\nYou can now sign in with your new password.');
        history.push('/');
      }
    } catch (error) {
      notificationService.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-gray-900 to-black">
        <div className="text-center p-8 rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/30 mx-auto mb-4"></div>
          <p className="text-white/80">Validating reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-gray-900 to-black px-4">
      <div className="max-w-md w-full space-y-8 p-8 rounded-2xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl flex items-center justify-center shadow-lg">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                <path d="M12 6L16 10L12 18L8 10L12 6Z" fill="currentColor" stroke="currentColor" strokeWidth="0.5" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white">Reset Your Password</h2>
          <p className="mt-2 text-sm text-white/70">
            Enter your new password below
          </p>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handlePasswordReset}>
          <div className="space-y-4">
            {/* New Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-white/90 mb-2">
                New Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border border-white/20 placeholder-white/50 text-white rounded-lg bg-white/5 backdrop-blur-lg focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30 transition-all"
                placeholder="Enter your new password"
                minLength={6}
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-white/90 mb-2">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border border-white/20 placeholder-white/50 text-white rounded-lg bg-white/5 backdrop-blur-lg focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30 transition-all"
                placeholder="Confirm your new password"
                minLength={6}
              />
            </div>
          </div>

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-white/20 text-sm font-medium rounded-lg text-white bg-white/10 backdrop-blur-lg hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Updating Password...
                </div>
              ) : (
                'Update Password'
              )}
            </button>
          </div>

          {/* Back to Sign In */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => history.push('/')}
              className="text-sm text-white/70 hover:text-white transition-colors"
            >
              Back to Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordResetPage;
