import React, { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, Eye, EyeOff, X, ShieldAlert } from 'lucide-react';

interface PasswordPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  targetFeatureName?: string;
}

const REQUIRED_PASSWORD = 'schedulingteam2026';

export const PasswordPromptModal: React.FC<PasswordPromptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  targetFeatureName = 'Settings',
}) => {
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
      setShowPassword(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === REQUIRED_PASSWORD) {
      setError(null);
      setPassword('');
      onSuccess();
    } else {
      setError('Incorrect password. Access denied.');
      setPassword('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-neutral-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shadow-2xs">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900">
                Protected Access
              </h3>
              <p className="text-xs text-neutral-500">
                Password required to access {targetFeatureName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5 flex items-center justify-between">
              <span>Team Password</span>
              <span className="text-[10px] text-neutral-400 font-normal">
                Restricted to scheduling team
              </span>
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter password..."
                className={`w-full pl-9 pr-10 py-2.5 text-xs rounded-xl border bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 font-mono ${
                  error
                    ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/20'
                    : 'border-neutral-300 focus:ring-neutral-900'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-700"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-rose-600 font-medium">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5"
            >
              <Unlock className="w-3.5 h-3.5" />
              Unlock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
