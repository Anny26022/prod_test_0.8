import React from 'react';
import { notificationService } from '../../services/notificationService';

export const ToastDemo: React.FC = () => {
  const handleTestAuth = () => {
    // Test different auth notifications
    setTimeout(() => notificationService.auth.invalidCredentials(), 100);
    setTimeout(() => notificationService.auth.emailNotVerified(), 2000);
    setTimeout(() => notificationService.auth.signUpSuccess('user@example.com'), 4000);
    setTimeout(() => notificationService.auth.signInSuccess('user@example.com'), 6000);
  };

  const handleTestTrade = () => {
    // Test trade notifications
    setTimeout(() => notificationService.trade.saved('AAPL Long Position'), 100);
    setTimeout(() => notificationService.trade.imported(25), 2000);
    setTimeout(() => notificationService.chart.uploaded('Entry'), 4000);
  };

  const handleTestPortfolio = () => {
    // Test portfolio notifications
    setTimeout(() => notificationService.portfolio.syncSuccess(), 100);
    setTimeout(() => notificationService.portfolio.updated(), 2000);
    setTimeout(() => notificationService.warning('Portfolio Warning\n\nThis is a test warning message.'), 4000);
  };

  const handleTestAll = () => {
    // Test all notification types
    setTimeout(() => notificationService.success('Success Message\n\nThis is a test success notification.'), 100);
    setTimeout(() => notificationService.error('Error Message\n\nThis is a test error notification.'), 1500);
    setTimeout(() => notificationService.warning('Warning Message\n\nThis is a test warning notification.'), 3000);
    setTimeout(() => notificationService.info('Info Message\n\nThis is a test info notification.'), 4500);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">Toast Demo</h3>
      <div className="space-y-2">
        <button
          onClick={handleTestAuth}
          className="w-full px-3 py-2 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Test Auth Toasts
        </button>
        <button
          onClick={handleTestTrade}
          className="w-full px-3 py-2 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
        >
          Test Trade Toasts
        </button>
        <button
          onClick={handleTestPortfolio}
          className="w-full px-3 py-2 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
        >
          Test Portfolio Toasts
        </button>
        <button
          onClick={handleTestAll}
          className="w-full px-3 py-2 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
        >
          Test All Types
        </button>
        <button
          onClick={() => notificationService.dismissAll()}
          className="w-full px-3 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          Clear All
        </button>
      </div>
    </div>
  );
};

export default ToastDemo;
