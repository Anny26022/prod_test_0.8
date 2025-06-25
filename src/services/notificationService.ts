import { toast } from 'react-toastify';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationOptions {
  position?: 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';
  autoClose?: number | false;
  hideProgressBar?: boolean;
  closeOnClick?: boolean;
  pauseOnHover?: boolean;
  draggable?: boolean;
}

class NotificationService {
  private defaultOptions: NotificationOptions = {
    position: 'top-right',
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
  };

  /**
   * Show a success notification
   */
  success(message: string, options?: NotificationOptions) {
    return toast.success(message, {
      ...this.defaultOptions,
      ...options,
    });
  }

  /**
   * Show an error notification
   */
  error(message: string, options?: NotificationOptions) {
    return toast.error(message, {
      ...this.defaultOptions,
      autoClose: 8000, // Longer duration for errors
      ...options,
    });
  }

  /**
   * Show a warning notification
   */
  warning(message: string, options?: NotificationOptions) {
    return toast.warning(message, {
      ...this.defaultOptions,
      autoClose: 6000,
      ...options,
    });
  }

  /**
   * Show an info notification
   */
  info(message: string, options?: NotificationOptions) {
    return toast.info(message, {
      ...this.defaultOptions,
      ...options,
    });
  }

  /**
   * Authentication-specific notifications
   */
  auth = {
    signUpSuccess: (email: string) => {
      return this.success(
        `Account Created!\n\nVerification email sent to ${email}\nPlease check your inbox to activate.`,
        { autoClose: 8000 }
      );
    },

    signInSuccess: (email: string) => {
      return this.success(`Welcome back!\n\n${email}`, { autoClose: 3000 });
    },

    signOutSuccess: () => {
      return this.info('Signed out successfully', { autoClose: 2500 });
    },

    emailVerificationSent: (email: string) => {
      return this.info(
        `Verification Email Sent\n\nCheck ${email} inbox`,
        { autoClose: 6000 }
      );
    },

    passwordResetSent: (email: string) => {
      return this.info(
        `Password Reset Link Sent\n\nCheck your email at ${email}\n\nThe link will expire in 1 hour.`,
        { autoClose: 8000 }
      );
    },

    invalidCredentials: () => {
      return this.error(
        'Authentication Failed\n\nIncorrect email or password',
        { autoClose: 5000 }
      );
    },

    emailNotVerified: () => {
      return this.error(
        'Email Verification Required\n\nCheck your inbox and verify email',
        { autoClose: 6000 }
      );
    },

    sessionExpired: () => {
      return this.warning('Session Expired\n\nPlease sign in again to continue.', { autoClose: 5000 });
    },

    accountAlreadyExists: () => {
      return this.error(
        'Account Already Exists\n\nAn account with this email is already registered.\n\nTry signing in instead.',
        { autoClose: 7000 }
      );
    },
  };

  /**
   * Trade-related notifications
   */
  trade = {
    saved: (tradeName: string) => {
      return this.success(`Trade Saved\n\n"${tradeName}" has been saved successfully.`);
    },

    deleted: (tradeName: string) => {
      return this.success(`Trade Deleted\n\n"${tradeName}" has been removed from your journal.`);
    },

    imported: (count: number) => {
      return this.success(`Import Complete\n\nSuccessfully imported ${count} trade${count !== 1 ? 's' : ''} to your journal.`);
    },

    exported: (count: number) => {
      return this.success(`Export Complete\n\nSuccessfully exported ${count} trade${count !== 1 ? 's' : ''} to file.`);
    },

    validationError: (message: string) => {
      return this.error(`Validation Error\n\n${message}`);
    },
  };

  /**
   * Chart-related notifications
   */
  chart = {
    uploaded: (type: string) => {
      return this.success(`Chart Uploaded\n\n${type} chart has been attached successfully.`);
    },

    uploadError: (error: string) => {
      return this.error(`Chart Upload Failed\n\n${error}`);
    },

    deleted: () => {
      return this.success('Chart Deleted\n\nChart attachment has been removed.');
    },
  };

  /**
   * Portfolio-related notifications
   */
  portfolio = {
    updated: () => {
      return this.success('Portfolio Updated\n\nYour portfolio settings have been saved.');
    },

    syncSuccess: () => {
      return this.success('Sync Complete\n\nAll data has been synchronized successfully.');
    },

    syncError: () => {
      return this.error('Sync Failed\n\nUnable to synchronize data. Please try again.');
    },

    backupCreated: () => {
      return this.success('Backup Created\n\nYour data has been backed up successfully.');
    },

    dataCleared: () => {
      return this.warning('Data Cleared\n\nAll application data has been removed.');
    },
  };

  /**
   * Dismiss all notifications
   */
  dismissAll() {
    toast.dismiss();
  }

  /**
   * Dismiss a specific notification
   */
  dismiss(toastId: string | number) {
    toast.dismiss(toastId);
  }
}

// Export a singleton instance
export const notificationService = new NotificationService();
export default notificationService;
