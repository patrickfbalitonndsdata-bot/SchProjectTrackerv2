import React, { useState } from 'react';
import {
  X,
  Code2,
  ExternalLink,
  Check,
  AlertCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
} from 'lucide-react';
import { SheetConfig } from '../types';
import {
  APPS_SCRIPT_TEMPLATE_CODE,
  testAppsScriptConnection,
  FIXED_SPREADSHEET_URL,
  FIXED_APPS_SCRIPT_URL,
} from '../lib/sheetsApi';

interface AppsScriptSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SheetConfig;
  onSaveAppsScriptUrl: (url: string) => void;
  onSyncSheetConfig?: (newConfig: SheetConfig) => void;
}

export const AppsScriptSetupModal: React.FC<AppsScriptSetupModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveAppsScriptUrl,
  onSyncSheetConfig,
}) => {
  const [urlInput, setUrlInput] = useState<string>(config.appsScriptUrl || '');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    spreadsheetName?: string;
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    sheetTabs?: string[];
    isDynamicOpenSupported?: boolean;
  } | null>(null);
  const [codeCopied, setCodeCopied] = useState<boolean>(false);
  const [showCode, setShowCode] = useState<boolean>(false);

  if (!isOpen) return null;

  const targetSpreadsheetUrl =
    config.spreadsheetUrl ||
    (config.spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`
      : FIXED_SPREADSHEET_URL);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE_CODE);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);
  };

  const handleTestAndSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUrl = urlInput.trim();

    if (!cleanUrl) {
      setTestResult({
        success: false,
        message: 'Please enter a valid Google Apps Script Web App URL.',
      });
      return;
    }

    if (!cleanUrl.includes('script.google.com') || !cleanUrl.includes('/exec')) {
      setTestResult({
        success: false,
        message:
          'URL format warning: Google Apps Script Web App URLs usually start with https://script.google.com/macros/s/... and end with /exec.',
      });
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await testAppsScriptConnection(
        cleanUrl,
        config.spreadsheetId,
        config.spreadsheetUrl,
        config.sheetName
      );

      if (res.ok) {
        setTestResult({
          success: true,
          message: res.message,
          spreadsheetName: res.spreadsheetName,
          spreadsheetId: res.spreadsheetId,
          spreadsheetUrl: res.spreadsheetUrl,
          sheetTabs: res.sheetTabs,
          isDynamicOpenSupported: res.isDynamicOpenSupported,
        });
        onSaveAppsScriptUrl(cleanUrl);
      } else {
        setTestResult({
          success: false,
          message:
            res.message ||
            'Could not reach the Web App. Please ensure "Who has access" is set to "Anyone" in your deployment settings.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Network test failed.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleQuickSaveWithoutTest = () => {
    const cleanUrl = urlInput.trim();
    onSaveAppsScriptUrl(cleanUrl);
    onClose();
  };

  return (
    <div
      id="apps-script-setup-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-neutral-200 shadow-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-neutral-900 text-white rounded-xl shadow-2xs">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">
                Google Apps Script Web App API Setup
              </h3>
              <p className="text-[11px] text-neutral-500">
                Direct connection to your private Google Sheet without requiring user Google sign-in.
              </p>
            </div>
          </div>
          <button
            id="close-apps-script-modal"
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-700">
          {/* Architecture Badge */}
          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-neutral-200 text-neutral-800 rounded font-mono text-[11px] font-medium">
                React Frontend
              </span>
              <span className="text-neutral-400 font-bold">&rarr;</span>
              <span className="px-2 py-0.5 bg-neutral-900 text-white rounded font-mono text-[11px] font-medium">
                Apps Script Web App
              </span>
              <span className="text-neutral-400 font-bold">&rarr;</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-mono text-[11px] font-medium">
                Private Sheet
              </span>
            </div>
            <span className="text-[10px] text-neutral-500 font-medium shrink-0">
              No user login needed
            </span>
          </div>

          {/* Step 1 to 4 Instructions */}
          <div className="space-y-3">
            <h4 className="font-semibold text-neutral-900 text-xs flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-neutral-800" />
              Easy 2-Minute Setup in Google Sheets:
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="p-3 bg-white border border-neutral-200 rounded-xl">
                <div className="flex items-center gap-1.5 font-semibold text-neutral-900 mb-1">
                  <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] flex items-center justify-center font-bold">
                    1
                  </span>
                  Open Spreadsheet
                </div>
                <p className="text-[11px] text-neutral-600 mb-2">
                  Open your Google Sheet and go to:
                  <br />
                  <strong className="text-neutral-800">Extensions &gt; Apps Script</strong>
                </p>
                <a
                  href={targetSpreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium underline max-w-full truncate"
                >
                  <span>Open {config.spreadsheetTitle || config.sheetName || 'Google Sheet'}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>

              <div className="p-3 bg-white border border-neutral-200 rounded-xl">
                <div className="flex items-center gap-1.5 font-semibold text-neutral-900 mb-1">
                  <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] flex items-center justify-center font-bold">
                    2
                  </span>
                  Paste Script
                </div>
                <p className="text-[11px] text-neutral-600 mb-2">
                  Clear existing code in <code className="bg-neutral-100 px-1 rounded">Code.gs</code>, paste the provided script, and click Save.
                </p>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-md text-[11px] font-medium transition-colors"
                >
                  {codeCopied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>Copied Script!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Apps Script Code</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-3 bg-white border border-neutral-200 rounded-xl">
                <div className="flex items-center gap-1.5 font-semibold text-neutral-900 mb-1">
                  <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] flex items-center justify-center font-bold">
                    3
                  </span>
                  Deploy as Web App
                </div>
                <p className="text-[11px] text-neutral-600">
                  Click <strong className="text-neutral-800">Deploy &gt; New deployment</strong>
                  <br />
                  Select type: <strong className="text-neutral-800">Web app</strong>
                  <br />
                  Set Execute as: <strong className="text-neutral-800">Me</strong>
                  <br />
                  Set Who has access: <strong className="text-emerald-700">Anyone</strong>
                </p>
              </div>

              <div className="p-3 bg-white border border-neutral-200 rounded-xl">
                <div className="flex items-center gap-1.5 font-semibold text-neutral-900 mb-1">
                  <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[10px] flex items-center justify-center font-bold">
                    4
                  </span>
                  Paste Web App URL Below
                </div>
                <p className="text-[11px] text-neutral-600">
                  Copy the deployment URL ending in <code className="bg-neutral-100 px-1 rounded">/exec</code> and paste it into the field below.
                </p>
              </div>
            </div>
          </div>

          {/* Collapsible View Code */}
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCode(!showCode)}
              className="w-full px-4 py-2.5 bg-neutral-50 hover:bg-neutral-100 flex items-center justify-between text-xs font-semibold text-neutral-800 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-neutral-500" />
                View Google Apps Script (Code.gs) Source
              </span>
              {showCode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showCode && (
              <div className="p-3 bg-neutral-900 text-neutral-100 font-mono text-[11px] overflow-x-auto max-h-56 relative select-all leading-relaxed">
                <div className="absolute top-2 right-2">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-[10px] flex items-center gap-1"
                  >
                    {codeCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {codeCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre>{APPS_SCRIPT_TEMPLATE_CODE}</pre>
              </div>
            )}
          </div>

          {/* Web App URL Form */}
          <form onSubmit={handleTestAndSave} className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-neutral-900">
                  Google Apps Script Web App URL:
                </label>
                <button
                  type="button"
                  onClick={() => setUrlInput(FIXED_APPS_SCRIPT_URL)}
                  className="text-[10px] text-blue-600 hover:text-blue-800 underline font-medium"
                >
                  Restore Fixed API URL
                </button>
              </div>
              <input
                id="apps-script-url-input"
                type="url"
                required
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-mono border border-neutral-300 rounded-xl bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>

            {/* Test Results */}
            {testResult && (
              <div
                className={`p-3.5 rounded-xl space-y-2.5 text-xs border ${
                  testResult.success
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                    : 'bg-amber-50/80 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult.success ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold text-sm">
                      {testResult.success ? 'API Connection Verified!' : 'Connection Notice'}
                    </div>
                    <div className="mt-0.5 text-xs opacity-90">{testResult.message}</div>
                  </div>
                </div>

                {testResult.success && testResult.spreadsheetName && (
                  <div className="bg-white/90 rounded-lg p-2.5 border border-emerald-200 space-y-1.5 text-[11px] text-neutral-800">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-medium">Bound Spreadsheet:</span>
                      <span className="font-semibold text-neutral-900">{testResult.spreadsheetName}</span>
                    </div>
                    {testResult.spreadsheetId && (
                      <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                        <span>Spreadsheet ID:</span>
                        <span className="truncate max-w-[200px]">{testResult.spreadsheetId}</span>
                      </div>
                    )}
                    {testResult.sheetTabs && testResult.sheetTabs.length > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500 font-medium">Found Tabs:</span>
                        <span className="font-medium text-emerald-800">
                          {testResult.sheetTabs.slice(0, 4).join(', ')}
                          {testResult.sheetTabs.length > 4 ? ` (+${testResult.sheetTabs.length - 4} more)` : ''}
                        </span>
                      </div>
                    )}
                    <div className="pt-1 border-t border-neutral-100 flex items-center justify-between text-[10px]">
                      <span className="text-neutral-500">Dynamic Multi-Sheet Mode:</span>
                      <span className="font-medium text-emerald-700">
                        {testResult.isDynamicOpenSupported
                          ? '✓ Enabled (openById supported)'
                          : '⚡ Active sheet mode'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Mismatch detection */}
                {testResult.success &&
                  testResult.spreadsheetId &&
                  config.spreadsheetId &&
                  testResult.spreadsheetId !== config.spreadsheetId && (
                    <div className="p-2.5 bg-amber-100/70 border border-amber-300 rounded-lg text-[11px] text-amber-950 space-y-1">
                      <div className="font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                        Target Sheet Mismatch
                      </div>
                      <p className="text-[10px] leading-relaxed text-amber-900">
                        This Web App is hosted in &quot;<strong>{testResult.spreadsheetName}</strong>&quot;, but your app&apos;s Target Sheet Link is set to &quot;{config.spreadsheetTitle || config.sheetName}&quot;.
                      </p>
                      {onSyncSheetConfig && (
                        <button
                          type="button"
                          onClick={() => {
                            onSyncSheetConfig({
                              ...config,
                              spreadsheetId: testResult.spreadsheetId!,
                              spreadsheetUrl: testResult.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${testResult.spreadsheetId}/edit`,
                              spreadsheetTitle: testResult.spreadsheetName || config.sheetName,
                            });
                          }}
                          className="mt-1 px-2.5 py-1 bg-amber-900 hover:bg-amber-800 text-white rounded text-[10px] font-medium transition-colors inline-flex items-center gap-1"
                        >
                          <span>Sync App Link to &quot;{testResult.spreadsheetName}&quot;</span>
                        </button>
                      )}
                    </div>
                  )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleQuickSaveWithoutTest}
                className="px-3.5 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                Save URL Directly
              </button>
              <button
                id="test-save-apps-script-btn"
                type="submit"
                disabled={isTesting || !urlInput.trim()}
                className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-medium transition-colors shadow-2xs flex items-center gap-2 disabled:opacity-40"
              >
                {isTesting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Testing API Connection...
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Test & Save Connection
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
