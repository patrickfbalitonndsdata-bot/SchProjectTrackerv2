import React, { useState } from 'react';
import { FileSpreadsheet, ExternalLink, RefreshCw, Check, AlertTriangle, Layers } from 'lucide-react';
import { SheetConfig } from '../types';
import { extractSpreadsheetId } from '../lib/dateUtils';
import { fetchSpreadsheetMetadata, checkOrInitializeHeader } from '../lib/sheetsApi';

interface SheetConnectorProps {
  config: SheetConfig;
  onConfigChange: (newConfig: SheetConfig) => void;
  accessToken: string | null;
  onRequireAuth: () => void;
  onSheetConnected?: () => void;
}

export const SheetConnector: React.FC<SheetConnectorProps> = ({
  config,
  onConfigChange,
  accessToken,
  onRequireAuth,
  onSheetConnected,
}) => {
  const [inputUrl, setInputUrl] = useState<string>(config.spreadsheetUrl || config.spreadsheetId || '');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isInitializingHeader, setIsInitializingHeader] = useState<boolean>(false);

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!accessToken) {
      onRequireAuth();
      return;
    }

    const cleanId = extractSpreadsheetId(inputUrl);
    if (!cleanId) {
      setErrorMessage('Please enter a valid Google Sheet link or Spreadsheet ID.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const meta = await fetchSpreadsheetMetadata(cleanId, accessToken);
      const sheetTabs = meta.sheets.map((s) => s.title);
      const activeSheet = sheetTabs.includes(config.sheetName)
        ? config.sheetName
        : sheetTabs[0] || 'Sheet1';

      const newConfig: SheetConfig = {
        spreadsheetId: cleanId,
        spreadsheetUrl: inputUrl.startsWith('http')
          ? inputUrl
          : `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
        sheetName: activeSheet,
        availableSheets: sheetTabs,
        spreadsheetTitle: meta.title,
      };

      onConfigChange(newConfig);
      setSuccessMessage(`Connected to "${meta.title}" with ${sheetTabs.length} sheet tab(s).`);

      // Verify or initialize header
      try {
        await checkOrInitializeHeader(cleanId, activeSheet, accessToken);
      } catch (headErr) {
        console.warn('Header verification notice:', headErr);
      }

      if (onSheetConnected) onSheetConnected();
    } catch (err: any) {
      console.error('Spreadsheet connection error:', err);
      setErrorMessage(
        err.message ||
          'Failed to access Google Sheet. Please make sure the sheet is shared with your signed-in Google account or accessible.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSheetTabChange = async (newTab: string) => {
    const updated = { ...config, sheetName: newTab };
    onConfigChange(updated);
    if (accessToken && config.spreadsheetId) {
      try {
        await checkOrInitializeHeader(config.spreadsheetId, newTab, accessToken);
      } catch (err) {
        console.warn('Header initialization failed for tab:', newTab, err);
      }
    }
  };

  const handleEnsureHeader = async () => {
    if (!accessToken || !config.spreadsheetId || !config.sheetName) return;
    setIsInitializingHeader(true);
    try {
      const initialized = await checkOrInitializeHeader(config.spreadsheetId, config.sheetName, accessToken);
      if (initialized) {
        setSuccessMessage('Standard 13-column PSU header row created in your sheet!');
      } else {
        setSuccessMessage('Header row already exists in this sheet.');
      }
    } catch (err: any) {
      setErrorMessage('Could not verify/create headers: ' + err.message);
    } finally {
      setIsInitializingHeader(false);
    }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left info */}
        <div className="flex items-start space-x-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              Google Sheet Database Connection
              {config.spreadsheetTitle && (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  <Check className="w-3 h-3" /> Connected
                </span>
              )}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Enter your target Google Sheet link or ID. Entries will be appended as new rows into your sheet.
            </p>
          </div>
        </div>

        {/* Action / External Link */}
        {config.spreadsheetId && (
          <div className="flex items-center gap-2 shrink-0">
            <a
              id="open-sheet-btn"
              href={
                config.spreadsheetUrl ||
                `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors border border-neutral-200"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Sheet in Drive
            </a>
          </div>
        )}
      </div>

      {/* Input row */}
      <form onSubmit={handleConnect} className="mt-4 flex flex-col sm:flex-row items-stretch gap-2.5">
        <div className="relative flex-1">
          <input
            id="sheet-link-input"
            type="text"
            placeholder="Paste Google Sheet URL or Spreadsheet ID (e.g., https://docs.google.com/spreadsheets/d/...)"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            className="w-full px-3.5 py-2 text-xs border border-neutral-300 rounded-lg bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent font-mono"
          />
        </div>

        <button
          id="connect-sheet-btn"
          type="submit"
          disabled={isLoading || !inputUrl.trim()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-950 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Connecting...
            </>
          ) : (
            'Connect Sheet'
          )}
        </button>
      </form>

      {/* Sheet tab selector and metadata if connected */}
      {config.spreadsheetId && config.availableSheets.length > 0 && (
        <div className="mt-3.5 pt-3.5 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-neutral-500 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-neutral-400" />
              Target Sheet Tab:
            </span>
            <select
              id="sheet-tab-select"
              value={config.sheetName}
              onChange={(e) => handleSheetTabChange(e.target.value)}
              className="bg-white border border-neutral-300 rounded-md px-2.5 py-1 text-xs text-neutral-800 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-900"
            >
              {config.availableSheets.map((tab) => (
                <option key={tab} value={tab}>
                  {tab}
                </option>
              ))}
            </select>

            <button
              id="verify-headers-btn"
              type="button"
              onClick={handleEnsureHeader}
              disabled={isInitializingHeader}
              className="text-[11px] text-neutral-600 hover:text-neutral-900 underline underline-offset-2 ml-1"
            >
              {isInitializingHeader ? 'Checking headers...' : 'Verify standard column headers'}
            </button>
          </div>

          <div className="text-[11px] text-neutral-400 font-mono truncate max-w-xs">
            ID: {config.spreadsheetId}
          </div>
        </div>
      )}

      {/* Alerts */}
      {errorMessage && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">
            <span className="font-semibold">Connection Issue: </span>
            {errorMessage}
            {!accessToken && (
              <button
                type="button"
                onClick={onRequireAuth}
                className="ml-2 font-medium underline text-red-800 hover:text-red-950"
              >
                Sign in with Google now
              </button>
            )}
          </div>
        </div>
      )}

      {successMessage && (
        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
          <Check className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}
    </div>
  );
};
