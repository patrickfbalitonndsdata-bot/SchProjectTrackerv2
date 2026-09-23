import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  Copy,
  Check,
  ExternalLink,
  Key,
  RotateCw,
  Sparkles,
  Info,
  CheckCircle2,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetrySignIn: () => void;
  onApplyManualToken: (token: string, email: string) => void;
  errorMessage?: string | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onRetrySignIn,
  onApplyManualToken,
  errorMessage,
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'authorize' | 'manual'>('authorize');
  const [manualToken, setManualToken] = useState<string>('');
  const [manualEmail, setManualEmail] = useState<string>('ptrckzy@gmail.com');
  const [tokenApplied, setTokenApplied] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'ais-dev-h2yj5hhqalqls5uwsoj6pd-221552841632.asia-southeast1.run.app';
  const devHost = 'ais-dev-h2yj5hhqalqls5uwsoj6pd-221552841632.asia-southeast1.run.app';
  const preHost = 'ais-pre-h2yj5hhqalqls5uwsoj6pd-221552841632.asia-southeast1.run.app';
  const projectId = firebaseConfig.projectId || 'gen-lang-client-0922762403';
  const consoleAuthUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;

  const handleCopy = (text: string, type: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    onApplyManualToken(
      manualToken.trim(),
      manualEmail.trim() || 'ptrckzy@gmail.com'
    );
    setTokenApplied(true);
    setTimeout(() => {
      setTokenApplied(false);
      onClose();
    }, 1200);
  };

  return (
    <div
      id="auth-error-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full border border-neutral-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">
                Google Authentication Setup
              </h3>
              <p className="text-[11px] text-neutral-500 font-mono">
                Project: {projectId}
              </p>
            </div>
          </div>
          <button
            id="close-auth-modal-btn"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-neutral-200 bg-neutral-50 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('authorize')}
            className={`flex-1 py-2.5 text-center transition-colors border-b-2 ${
              activeTab === 'authorize'
                ? 'border-neutral-900 text-neutral-900 bg-white font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Authorize Domain (Recommended)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2.5 text-center transition-colors border-b-2 ${
              activeTab === 'manual'
                ? 'border-neutral-900 text-neutral-900 bg-white font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Enter Access Token Directly
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6">
          {activeTab === 'authorize' ? (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-600" />
                  Why did this occur? (auth/unauthorized-domain)
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Firebase Authentication requires every app domain to be added to the Authorized Domains list
                  in your Firebase project to prevent unauthorized origins from executing OAuth sign-ins.
                </p>
              </div>

              {/* Hostnames to copy */}
              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-neutral-700 text-[11px]">
                      Active Development Domain:
                    </label>
                    <span className="text-[10px] text-neutral-400">Current active sandbox</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-2.5 py-1.5 bg-neutral-100 border border-neutral-200 rounded-lg font-mono text-[10px] text-neutral-800 truncate select-all">
                      {devHost}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(devHost, 'dev')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 rounded-lg text-[11px] font-medium shadow-2xs transition-colors shrink-0"
                    >
                      {copiedType === 'dev' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-neutral-500" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-neutral-700 text-[11px]">
                      Preview / Shared App Domain:
                    </label>
                    <span className="text-[10px] text-neutral-400">For shared links</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-2.5 py-1.5 bg-neutral-100 border border-neutral-200 rounded-lg font-mono text-[10px] text-neutral-800 truncate select-all">
                      {preHost}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(preHost, 'pre')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 rounded-lg text-[11px] font-medium shadow-2xs transition-colors shrink-0"
                    >
                      {copiedType === 'pre' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-neutral-500" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* 3 Step Instructions */}
              <div className="space-y-2 border-t border-neutral-100 pt-3">
                <div className="font-semibold text-neutral-800">
                  Quick Steps to Authorize (takes 30 seconds):
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-neutral-600 text-[11px] leading-relaxed">
                  <li>
                    Click the button below to open Firebase Console for project{' '}
                    <strong className="text-neutral-800 font-mono">{projectId}</strong>.
                  </li>
                  <li>
                    In the <strong>Authorized domains</strong> section, click <strong>Add domain</strong> and paste the domain above.
                  </li>
                  <li>
                    Return to this tab and click <strong>Try Sign-In Again</strong>!
                  </li>
                </ol>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <a
                  href={consoleAuthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl font-semibold transition-colors shadow-2xs text-xs"
                >
                  <span>Open Firebase Settings</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRetrySignIn();
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 rounded-xl font-medium transition-colors text-xs"
                >
                  <RotateCw className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Try Sign-In Again</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-700 text-[11px] leading-relaxed">
                If you cannot edit Firebase authorized domains right now, you can paste a Google OAuth Access Token
                (from <strong className="text-neutral-900">Google OAuth 2.0 Playground</strong> or <strong className="text-neutral-900">gcloud auth print-access-token</strong>)
                with scope <code className="bg-neutral-200/60 px-1 py-0.5 rounded text-[10px]">https://www.googleapis.com/auth/spreadsheets</code>.
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Google OAuth Access Token <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Paste Bearer token (ya29.a0...)"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-mono placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Your Google Account Email (Optional)
                </label>
                <input
                  type="email"
                  placeholder="e.g., yourname@domain.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              {tokenApplied && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Access token connected! You can now append rows to Google Sheets.</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!manualToken.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg font-medium text-xs transition-colors shadow-2xs disabled:opacity-50"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Use Access Token</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
