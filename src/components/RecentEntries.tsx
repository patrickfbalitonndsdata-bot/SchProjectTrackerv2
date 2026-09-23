import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  RefreshCw,
  Search,
  ExternalLink,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react';
import { SheetEntryRow, SheetConfig } from '../types';
import { readRecentPsuEntries, FIXED_SHEET_NAME } from '../lib/sheetsApi';

interface RecentEntriesProps {
  sheetConfig: SheetConfig;
  refreshTrigger: number;
  onOpenAppsScriptSetup?: () => void;
  accessToken?: string | null;
}

export const DEFAULT_INITIAL_ENTRIES: SheetEntryRow[] = [
  {
    rowNumber: 3,
    emailAddress: 'raymond.buchberg@ndsdata.com',
    timestampMnl: '2026-09-11 12:45:43 AM',
    scheduler: 'Patrick',
    region: 'South Central',
    psuReceivedDateMnl: '2026-09-10',
    psuReceivedTimeMnl: '7:02:41 AM',
    projectNumber: '26-460067',
    version: '1',
    jobType: 'New',
    studyType: 'ATR',
    emailCategory: 'Initial',
    emailSubCategory: 'Initial setup',
    remarks:
      'Urgency: ASAP. 2 (24hr) ATR (1 day). Delivery requirements: Deliver both the raw data and the formatted counts.',
  },
  {
    rowNumber: 2,
    emailAddress: 'Chantel.Campa@ndsdata.com',
    timestampMnl: '2026-09-10 11:57:29 PM',
    scheduler: 'Jean',
    region: 'NYSDOT',
    psuReceivedDateMnl: '2026-09-10',
    psuReceivedTimeMnl: '6:09:50 AM',
    projectNumber: '26-110045',
    version: '1',
    jobType: 'New',
    studyType: 'TMC',
    emailCategory: 'Initial',
    emailSubCategory: 'PSU Request',
    remarks: 'Field technician deployment approved.',
  },
];

export const RecentEntries: React.FC<RecentEntriesProps> = ({
  sheetConfig,
  refreshTrigger,
  onOpenAppsScriptSetup,
  accessToken,
}) => {
  const [entries, setEntries] = useState<SheetEntryRow[]>(DEFAULT_INITIAL_ENTRIES);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const hasApiConnection = Boolean(sheetConfig.appsScriptUrl || accessToken);

  const loadEntries = useCallback(async () => {
    if (!hasApiConnection) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const rows = await readRecentPsuEntries(
        sheetConfig.spreadsheetId,
        (sheetConfig.sheetName && sheetConfig.sheetName !== 'Scheduling Submission') ? sheetConfig.sheetName : FIXED_SHEET_NAME,
        accessToken,
        40,
        sheetConfig.appsScriptUrl
      );
      if (rows && rows.length > 0) {
        setEntries(rows);
      }
    } catch (err: any) {
      console.warn('Recent entries load notice:', err);
      setError(err.message || 'Could not fetch live entries from sheet.');
    } finally {
      setIsLoading(false);
    }
  }, [hasApiConnection, sheetConfig.appsScriptUrl, sheetConfig.spreadsheetId, sheetConfig.sheetName, accessToken]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries, refreshTrigger]);

  const filtered = entries.filter((row) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      row.projectNumber.toLowerCase().includes(term) ||
      row.scheduler.toLowerCase().includes(term) ||
      row.studyType.toLowerCase().includes(term) ||
      row.region.toLowerCase().includes(term) ||
      row.emailCategory.toLowerCase().includes(term) ||
      row.psuReceivedDateMnl.toLowerCase().includes(term)
    );
  });

  if (!sheetConfig.spreadsheetId) {
    return null;
  }

  return (
    <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-neutral-200 gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-neutral-950 text-white rounded-md shadow-2xs">
            <Table className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-950 font-display flex items-center gap-2">
              <span>Recent Google Sheet Entries</span>
              <span className="text-[10px] font-mono font-medium text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-xs border border-neutral-200">
                {entries.length} records
              </span>
            </h3>
            <p className="text-[11px] text-neutral-500">
              Live synchronized records from tab: <strong className="text-neutral-900 font-semibold">{sheetConfig.sheetName}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              id="search-entries-input"
              type="text"
              placeholder="Filter by project, scheduler, study..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 w-48 sm:w-60 shadow-2xs font-medium"
            />
          </div>

          <button
            id="refresh-entries-btn"
            type="button"
            onClick={loadEntries}
            disabled={isLoading}
            title="Refresh rows from sheet"
            className="p-1.5 text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 rounded-sm border border-neutral-300 transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-neutral-950' : ''}`} />
          </button>

          <a
            id="view-in-sheets-btn"
            href={
              sheetConfig.spreadsheetUrl ||
              `https://docs.google.com/spreadsheets/d/${sheetConfig.spreadsheetId}/edit`
            }
            target="_blank"
            rel="noopener noreferrer"
            title="Open Google Sheet in new tab"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white bg-neutral-950 hover:bg-neutral-800 rounded-sm transition-all shadow-2xs"
          >
            <ExternalLink className="w-3 h-3 text-[#DFC772]" />
            <span className="hidden sm:inline">Open Sheet</span>
          </a>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Table Container */}
      <div className="mt-4 overflow-x-auto border border-neutral-200 rounded-lg">
        <table className="min-w-full divide-y divide-neutral-200 text-xs text-left">
          <thead className="bg-neutral-100 font-bold uppercase text-[10px] tracking-wider text-neutral-700">
            <tr>
              <th className="px-3.5 py-3 whitespace-nowrap">#</th>
              <th className="px-3.5 py-3 whitespace-nowrap">Timestamp (MNL)</th>
              <th className="px-3.5 py-3 whitespace-nowrap">Scheduler</th>
              <th className="px-3.5 py-3 whitespace-nowrap">Region</th>
              <th className="px-3.5 py-3 whitespace-nowrap">PSU Date / Time (MNL)</th>
              <th className="px-3.5 py-3 whitespace-nowrap">Project #</th>
              <th className="px-3.5 py-3 whitespace-nowrap">Study Type</th>
              <th className="px-3.5 py-3 whitespace-nowrap">Job / Ver</th>
              <th className="px-3.5 py-3 whitespace-nowrap">Category / Reason</th>
              <th className="px-3.5 py-3 whitespace-nowrap">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-white">
            {isLoading && entries.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-neutral-500">
                  <div className="inline-flex items-center gap-2 font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin text-neutral-950" />
                    Loading entries from Google Sheets...
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-neutral-500">
                  <FileSpreadsheet className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
                  {searchTerm
                    ? 'No entries match your filter criteria.'
                    : !hasApiConnection
                    ? 'No entries found. Setup your Apps Script Web App API to sync entries directly.'
                    : 'No entries found in this sheet yet. Submit your first PSU entry above!'}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.rowNumber} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-neutral-400">
                    {row.rowNumber}
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-neutral-600">
                    {row.timestampMnl}
                  </td>
                  <td className="px-3.5 py-2.5 font-semibold text-neutral-950 whitespace-nowrap">
                    {row.scheduler}
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-xs bg-neutral-100 text-neutral-800 border border-neutral-200 text-[10px] font-bold font-mono uppercase">
                      {row.region || '—'}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-neutral-950">
                    <div className="font-semibold">{row.psuReceivedDateMnl || '—'}</div>
                    <div className="text-[10px] text-neutral-500">{row.psuReceivedTimeMnl || ''}</div>
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap font-mono font-bold text-neutral-950">
                    {row.projectNumber || '—'}
                  </td>
                  <td className="px-3.5 py-2.5 max-w-[160px] truncate text-neutral-950 font-medium" title={row.studyType}>
                    {row.studyType || '—'}
                  </td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap text-neutral-600">
                    <span className="font-medium">{row.jobType || '—'}</span>
                    {row.version && (
                      <span className="ml-1 text-[10px] text-neutral-500 font-mono font-medium">({row.version})</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 max-w-[180px] text-neutral-950">
                    <div className="font-semibold truncate" title={row.emailCategory}>{row.emailCategory || '—'}</div>
                    {row.emailSubCategory && (
                      <div className="text-[10px] text-neutral-500 truncate" title={row.emailSubCategory}>
                        {row.emailSubCategory}
                      </div>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 max-w-[180px] truncate text-neutral-600 text-[11px]" title={row.remarks}>
                    {row.remarks || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
