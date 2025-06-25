import React from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  return (
    <>
      {children}
      <ToastContainer
        position="top-right"
        autoClose={6000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        toastClassName="nexus-toast"
        bodyClassName="nexus-toast-body"
        progressClassName="nexus-toast-progress"
        closeButton={({ closeToast }) => (
          <button
            onClick={closeToast}
            className="nexus-toast-close"
            aria-label="Close notification"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
        style={{
          fontSize: '15px',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          fontWeight: '400',
        }}
      />

      {/* Enhanced CSS for sleek toast styling */}
      <style jsx global>{`
        /* Toast Container - Compact */
        .Toastify__toast-container {
          width: 360px !important;
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif !important;
          z-index: 9999 !important;
        }

        /* Base Toast Styling - Ultra Transparent Glass */
        .nexus-toast {
          border-radius: 16px !important;
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif !important;
          font-size: 14px !important;
          font-weight: 500 !important;
          line-height: 1.4 !important;
          margin-bottom: 8px !important;
          min-height: 52px !important;
          backdrop-filter: blur(24px) saturate(200%) !important;
          -webkit-backdrop-filter: blur(24px) saturate(200%) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          position: relative !important;
          overflow: hidden !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }

        .nexus-toast:hover {
          transform: translateY(-1px) scale(1.01) !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }

        .nexus-toast-body {
          padding: 12px 50px 12px 16px !important;
          white-space: pre-line !important;
          display: flex !important;
          align-items: flex-start !important;
          gap: 10px !important;
          font-weight: 500 !important;
          letter-spacing: -0.01em !important;
        }

        .nexus-toast-progress {
          height: 3px !important;
          background: rgba(255, 255, 255, 0.2) !important;
        }

        /* Success Toast - Transparent Glass Emerald */
        .Toastify__toast--success.nexus-toast {
          background: rgba(16, 185, 129, 0.15) !important;
          color: #ffffff !important;
          border: 1px solid rgba(16, 185, 129, 0.2) !important;
          box-shadow:
            0 8px 32px rgba(16, 185, 129, 0.08),
            0 2px 12px rgba(16, 185, 129, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
        }

        .Toastify__toast--success .nexus-toast-progress {
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.7) 100%) !important;
        }

        .Toastify__toast--success .nexus-toast-body::before {
          content: "✓";
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          background: rgba(16, 185, 129, 0.2);
          border-radius: 50%;
          font-weight: 700;
          font-size: 11px;
          flex-shrink: 0;
          color: #10b981;
          box-shadow: 0 1px 3px rgba(16, 185, 129, 0.2);
        }

        /* Error Toast - Transparent Glass Black */
        .Toastify__toast--error.nexus-toast {
          background: rgba(17, 24, 39, 0.15) !important;
          color: #f9fafb !important;
          border: 1px solid rgba(75, 85, 99, 0.2) !important;
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.12),
            0 2px 12px rgba(17, 24, 39, 0.08),
            inset 0 1px 0 rgba(156, 163, 175, 0.1) !important;
        }

        .Toastify__toast--error .nexus-toast-progress {
          background: linear-gradient(90deg, rgba(239, 68, 68, 0.8) 0%, rgba(220, 38, 38, 0.6) 100%) !important;
        }

        .Toastify__toast--error .nexus-toast-body::before {
          content: "⚠";
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          background: rgba(239, 68, 68, 0.2);
          border-radius: 50%;
          font-weight: 700;
          font-size: 11px;
          flex-shrink: 0;
          color: #ef4444;
          box-shadow: 0 1px 3px rgba(239, 68, 68, 0.2);
        }

        /* Warning Toast - Transparent Glass Amber */
        .Toastify__toast--warning.nexus-toast {
          background: rgba(245, 158, 11, 0.15) !important;
          color: #ffffff !important;
          border: 1px solid rgba(245, 158, 11, 0.2) !important;
          box-shadow:
            0 8px 32px rgba(245, 158, 11, 0.08),
            0 2px 12px rgba(245, 158, 11, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
        }

        .Toastify__toast--warning .nexus-toast-progress {
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.7) 100%) !important;
        }

        .Toastify__toast--warning .nexus-toast-body::before {
          content: "⚠";
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          background: rgba(245, 158, 11, 0.2);
          border-radius: 50%;
          font-weight: 700;
          font-size: 11px;
          flex-shrink: 0;
          color: #f59e0b;
          box-shadow: 0 1px 3px rgba(245, 158, 11, 0.2);
        }

        /* Info Toast - Transparent Glass Blue */
        .Toastify__toast--info.nexus-toast {
          background: rgba(59, 130, 246, 0.15) !important;
          color: #ffffff !important;
          border: 1px solid rgba(59, 130, 246, 0.2) !important;
          box-shadow:
            0 8px 32px rgba(59, 130, 246, 0.08),
            0 2px 12px rgba(59, 130, 246, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
        }

        .Toastify__toast--info .nexus-toast-progress {
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.7) 100%) !important;
        }

        .Toastify__toast--info .nexus-toast-body::before {
          content: "ℹ";
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          background: rgba(59, 130, 246, 0.2);
          border-radius: 50%;
          font-weight: 700;
          font-size: 11px;
          flex-shrink: 0;
          color: #3b82f6;
          box-shadow: 0 1px 3px rgba(59, 130, 246, 0.2);
        }

        /* Custom Close Button - Compact */
        .nexus-toast-close {
          position: absolute !important;
          top: 12px !important;
          right: 12px !important;
          background: rgba(255, 255, 255, 0.15) !important;
          border: none !important;
          border-radius: 6px !important;
          width: 24px !important;
          height: 24px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          color: rgba(255, 255, 255, 0.9) !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          backdrop-filter: blur(4px) !important;
          z-index: 10 !important;
        }

        .nexus-toast-close:hover {
          background: rgba(255, 255, 255, 0.25) !important;
          color: #ffffff !important;
          transform: scale(1.05) !important;
        }

        .nexus-toast-close:active {
          transform: scale(0.95) !important;
        }

        /* Hide default close button */
        .Toastify__close-button {
          display: none !important;
        }

        /* Enhanced Animations */
        .Toastify__toast {
          animation-duration: 0.4s !important;
          animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
        }

        .Toastify__toast--rtl {
          animation-name: Toastify__slideInRight !important;
        }

        .Toastify__toast--ltr {
          animation-name: Toastify__slideInLeft !important;
        }

        /* Dark Mode Support */
        @media (prefers-color-scheme: dark) {
          .nexus-toast {
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2) !important;
            border-color: rgba(255, 255, 255, 0.08) !important;
          }
        }

        /* Mobile Responsive Design - Top Positioned */
        @media (max-width: 768px) {
          .Toastify__toast-container {
            width: calc(100vw - 32px) !important;
            left: 16px !important;
            right: 16px !important;
            top: 60px !important;
            margin: 0 !important;
            padding: 0 !important;
            position: fixed !important;
            transform: none !important;
            max-width: calc(100vw - 32px) !important;
          }

          .nexus-toast {
            margin: 0 0 8px 0 !important;
            border-radius: 12px !important;
            min-height: 44px !important;
            max-width: 100% !important;
          }

          .nexus-toast-body {
            padding: 8px 36px 8px 12px !important;
            font-size: 13px !important;
            gap: 8px !important;
            line-height: 1.3 !important;
          }

          .nexus-toast-body::before {
            width: 16px !important;
            height: 16px !important;
            font-size: 10px !important;
          }

          .nexus-toast-close {
            top: 6px !important;
            right: 6px !important;
            width: 20px !important;
            height: 20px !important;
          }

          .nexus-toast-close svg {
            width: 10px !important;
            height: 10px !important;
          }
        }

        /* Extra small screens */
        @media (max-width: 480px) {
          .Toastify__toast-container {
            width: calc(100vw - 24px) !important;
            left: 12px !important;
            right: 12px !important;
            top: 16px !important;
          }

          .nexus-toast {
            min-height: 40px !important;
          }

          .nexus-toast-body {
            padding: 6px 32px 6px 10px !important;
            font-size: 12px !important;
            line-height: 1.3 !important;
          }

          .nexus-toast-body::before {
            width: 14px !important;
            height: 14px !important;
            font-size: 9px !important;
          }

          .nexus-toast-close {
            top: 4px !important;
            right: 4px !important;
            width: 18px !important;
            height: 18px !important;
          }
        }
      `}</style>
    </>
  );
};

export default ToastProvider;
