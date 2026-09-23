import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  ExternalLink,
  Check,
  AlertCircle,
  RotateCcw,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { SheetConfig } from '../types';
import { extractSpreadsheetId } from '../lib/dateUtils';
import {
  fetchSpreadsheetMetadata,
  checkOrInitializeHeader,
  FIXED_SHEET_CONFIG,
} from '../lib/sheetsApi';

interface SheetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SheetConfig;
  onSaveConfig: (newConfig: SheetConfig) => void;
  onOpenAppsScriptSetup?: () => void;
}

export const SheetSettingsModal: React.FC<SheetSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onOpenAppsScriptSetup,
}) => {
  const [urlInput, setUrlInput] = useState<string>(
    config.spreadsheetUrl || (config.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit` : '')
  );
  const [tabInput, setTabInput] = useState<string>(config.sheetName || 'Project Tracker');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = urlInput.trim();
    if (!trimmed) {
      setError('Please provide a valid Google Sheet URL or Spreadsheet ID.');
      return;
    }

    const cleanId = extractSpreadsheetId(trimmed);
    if (!cleanId) {
      setError('Could not extract a valid Google Sheet ID from the provided link. Ensure it contains the spreadsheet ID.');
      return;
    }

    setIsLoading(true);
    try {
      const targetTab = tabInput.trim() || 'Project Tracker';
      const cleanUrl = trimmed.startsWith('http')
        ? trimmed
        : `https://docs.google.com/spreadsheets/d/${cleanId}/edit`;

      const updatedConfig: SheetConfig = {
        ...config,
        spreadsheetId: cleanId,
        spreadsheetUrl: cleanUrl,
        sheetName: targetTab,
        availableSheets: [targetTab],
        spreadsheetTitle: targetTab,
      };

      onSaveConfig(updatedConfig);
      setSuccess(`Google Sheet link updated! Saved for tab "${targetTab}".`);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Failed to save sheet link:', err);
      setError(err?.message || 'Could not update sheet link.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetDefault = () => {
    onSaveConfig(FIXED_SHEET_CONFIG);
    setUrlInput(FIXED_SHEET_CONFIG.spreadsheetUrl);
    setTabInput(FIXED_SHEET_CONFIG.sheetName);
    setSuccess('Restored default Project Tracker Google Sheet.');
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div
      id="sheet-settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full border border-neutral-200 shadow-xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-100/60 text-emerald-800 rounded-lg">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">
                Target Google Sheet Connection
              </h3>
              <p className="text-[11px] text-neutral-500">
                Configure which spreadsheet database receives PSU submissions
              </p>
            </div>
          </div>
          <button
            id="close-modal-btn"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleConnect} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          <div>
            <label htmlFor="modal-sheet-url-input" className="block text-xs font-semibold text-neutral-800 mb-1.5">
              Google Sheet Link or Spreadsheet ID
            </label>
            <input
              id="modal-sheet-url-input"
              type="text"
              required
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/1zJGQYdRbqcD.../edit"
              className="w-full px-3.5 py-2 text-xs border border-neutral-300 rounded-lg bg-white text-neutral-900 font-mono placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          <div>
            <label htmlFor="modal-sheet-tab-input" className="block text-xs font-semibold text-neutral-800 mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-neutral-400" />
              <span>Sheet Tab Name</span>
            </label>
            <input
              id="modal-sheet-tab-input"
              type="text"
              required
              value={tabInput}
              onChange={(e) => setTabInput(e.target.value)}
              placeholder="e.g., Project Tracker or Sheet1"
              className="w-full px-3.5 py-2 text-xs border border-neutral-300 rounded-lg bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          {/* Current Active Sheet Info */}
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-600 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-700">Current Target:</span>
              <a
                href={config.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-neutral-600 hover:text-neutral-900 underline flex items-center gap-1 font-mono"
              >
                <span>{config.spreadsheetTitle || config.sheetName}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="text-[11px] text-neutral-400 font-mono truncate">
              ID: {config.spreadsheetId}
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
            <button
              type="button"
              id="reset-default-sheet-btn"
              onClick={handleResetDefault}
              className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 transition-colors py-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Default</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="save-sheet-connection-btn"
                disabled={isLoading}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-medium transition-colors shadow-2xs disabled:opacity-50"
              >
                <span>{isLoading ? 'Verifying...' : 'Save & Connect'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
