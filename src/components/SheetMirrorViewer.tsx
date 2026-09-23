import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  Search,
  ExternalLink,
  Download,
  Filter,
  Layers,
  Clock,
  User,
  Globe,
  Tag,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Eye,
  Copy,
  Check,
  X,
  PlusCircle,
} from 'lucide-react';
import { SheetEntryRow, SheetConfig } from '../types';
import { readRecentPsuEntries, FIXED_SPREADSHEET_URL } from '../lib/sheetsApi';
import { DEFAULT_INITIAL_ENTRIES } from './RecentEntries';
import { isRevisedVersion } from '../lib/roster';

interface SheetMirrorViewerProps {
  sheetConfig: SheetConfig;
  refreshTrigger: number;
  onOpenAppsScriptSetup?: () => void;
  accessToken?: string | null;
  onSwitchToEntryTab?: () => void;
}

export const SheetMirrorViewer: React.FC<SheetMirrorViewerProps> = ({
  sheetConfig,
  refreshTrigger,
  onOpenAppsScriptSetup,
  accessToken,
  onSwitchToEntryTab,
}) => {
  const [entries, setEntries] = useState<SheetEntryRow[]>(DEFAULT_INITIAL_ENTRIES);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [jobTypeFilter, setJobTypeFilter] = useState<string>('ALL');
  const [schedulerFilter, setSchedulerFilter] = useState<string>('ALL');

  // Selected row for detail inspector modal
  const [selectedRow, setSelectedRow] = useState<SheetEntryRow | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const hasApiConnection = Boolean(sheetConfig.appsScriptUrl || accessToken);

  const loadEntries = useCallback(async () => {
    if (!hasApiConnection) return;

    setIsLoading(true);
    setError(null);

    try {
      const rows = await readRecentPsuEntries(
        sheetConfig.spreadsheetId,
        sheetConfig.sheetName || 'Project Tracker',
        accessToken,
        150, // Higher limit for comprehensive mirror view
        sheetConfig.appsScriptUrl
      );
      if (rows && rows.length > 0) {
        setEntries(rows);
      }
      const now = new Date();
      setLastSyncTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch (err: any) {
      console.warn('Sheet mirror sync notice:', err);
      setError(err.message || 'Could not fetch entries from Google Sheets.');
    } finally {
      setIsLoading(false);
    }
  }, [hasApiConnection, sheetConfig.appsScriptUrl, sheetConfig.spreadsheetId, sheetConfig.sheetName, accessToken]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries, refreshTrigger]);

  // Derive unique filter lists
  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.region && e.region.trim()) set.add(e.region.trim());
    });
    return Array.from(set).sort();
  }, [entries]);

  const availableJobTypes = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.jobType && e.jobType.trim()) set.add(e.jobType.trim());
    });
    return Array.from(set).sort();
  }, [entries]);

  const availableSchedulers = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.scheduler && e.scheduler.trim()) set.add(e.scheduler.trim());
    });
    return Array.from(set).sort();
  }, [entries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((row) => {
      if (regionFilter !== 'ALL' && row.region !== regionFilter) return false;
      if (jobTypeFilter !== 'ALL' && row.jobType !== jobTypeFilter) return false;
      if (schedulerFilter !== 'ALL' && row.scheduler !== schedulerFilter) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        row.projectNumber.toLowerCase().includes(term) ||
        row.scheduler.toLowerCase().includes(term) ||
        row.studyType.toLowerCase().includes(term) ||
        row.region.toLowerCase().includes(term) ||
        row.jobType.toLowerCase().includes(term) ||
        row.version.toLowerCase().includes(term) ||
        row.emailAddress.toLowerCase().includes(term) ||
        row.emailCategory.toLowerCase().includes(term) ||
        row.emailSubCategory.toLowerCase().includes(term) ||
        row.remarks.toLowerCase().includes(term) ||
        row.psuReceivedDateMnl.toLowerCase().includes(term)
      );
    });
  }, [entries, regionFilter, jobTypeFilter, schedulerFilter, searchTerm]);

  // Metrics summary
  const metrics = useMemo(() => {
    let rePsuCount = 0;
    let newInstallsCount = 0;
    const projectSet = new Set<string>();
    const schedulerSet = new Set<string>();

    entries.forEach((e) => {
      if (
        e.jobType === 'Re-PSU (Revised)' ||
        e.jobType.toLowerCase().includes('rev') ||
        isRevisedVersion(e.version)
      ) {
        rePsuCount++;
      } else if (e.jobType.toLowerCase().includes('new')) {
        newInstallsCount++;
      }
      if (e.projectNumber) projectSet.add(e.projectNumber.trim().toLowerCase());
      if (e.scheduler) schedulerSet.add(e.scheduler.trim().toLowerCase());
    });

    return {
      total: entries.length,
      rePsuCount,
      newInstallsCount,
      uniqueProjects: projectSet.size,
      uniqueSchedulers: schedulerSet.size,
    };
  }, [entries]);

  const handleCopyText = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleExportCsv = () => {
    if (filteredEntries.length === 0) return;

    const headers = [
      'Row #',
      'Email Address',
      'Timestamp (MNL)',
      'Scheduler',
      'Region',
      'PSU Received Date (MNL)',
      'PSU Received Time (MNL)',
      'Project Number',
      'Version',
      'Job Type',
      'Study Type',
      'Email Category',
      'Email Sub-Category / Description',
      'Remarks',
    ];

    const csvRows = [headers.join(',')];

    filteredEntries.forEach((r) => {
      const escape = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
      csvRows.push(
        [
          r.rowNumber,
          escape(r.emailAddress),
          escape(r.timestampMnl),
          escape(r.scheduler),
          escape(r.region),
          escape(r.psuReceivedDateMnl),
          escape(r.psuReceivedTimeMnl),
          escape(r.projectNumber),
          escape(r.version),
          escape(r.jobType),
          escape(r.studyType),
          escape(r.emailCategory),
          escape(r.emailSubCategory),
          escape(r.remarks),
        ].join(',')
      );
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `google_sheet_mirror_${sheetConfig.sheetName}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & Mirror Control Bar */}
      <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="w-11 h-11 rounded-md bg-neutral-950 text-white flex items-center justify-center shadow-2xs shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-[#DFC772]" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-950 font-display">
                  Google Sheet Mirror Viewer
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-950 border border-neutral-300 rounded-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Mirror
                </span>
                <span className="text-xs text-neutral-500 font-mono">
                  Tab: <strong className="text-neutral-900 font-semibold">{sheetConfig.sheetName}</strong>
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Real-time reflection of the linked Google Sheet database showing all 13 canonical columns alongside monitoring status.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-y-2">
            <button
              type="button"
              onClick={loadEntries}
              disabled={isLoading}
              className="inline-flex items-center space-x-1.5 h-9 px-3 text-xs font-bold uppercase tracking-wider text-neutral-800 hover:text-neutral-950 bg-neutral-100 hover:bg-neutral-200 rounded-sm border border-neutral-300 transition-colors shadow-2xs"
              title="Sync latest rows from Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-neutral-950 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Syncing...' : 'Sync Sheet'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredEntries.length === 0}
              className="inline-flex items-center space-x-1.5 h-9 px-3 text-xs font-bold uppercase tracking-wider text-neutral-800 hover:text-neutral-950 bg-neutral-100 hover:bg-neutral-200 rounded-sm border border-neutral-300 transition-colors shadow-2xs"
              title="Download filtered records as CSV"
            >
              <Download className="w-3.5 h-3.5 text-neutral-950" />
              <span>Export CSV</span>
            </button>

            <a
              href={sheetConfig.spreadsheetUrl || FIXED_SPREADSHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 h-9 px-3.5 text-xs font-bold uppercase tracking-wider text-white bg-neutral-950 hover:bg-neutral-800 active:bg-black rounded-sm transition-colors shadow-2xs"
              title="Open the actual Google Spreadsheet in a new tab"
            >
              <span>Open in Sheets</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#DFC772]" />
            </a>

            {onSwitchToEntryTab && (
              <button
                type="button"
                onClick={onSwitchToEntryTab}
                className="inline-flex items-center space-x-1.5 h-9 px-3.5 text-xs font-bold uppercase tracking-wider text-neutral-950 bg-neutral-100 hover:bg-neutral-200 rounded-sm transition-colors border border-neutral-300 shadow-2xs"
              >
                <PlusCircle className="w-3.5 h-3.5 text-neutral-950" />
                <span>Log New PSU</span>
              </button>
            )}
          </div>
        </div>

        {/* Monitoring Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4">
          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">Total Records</span>
            <div className="text-xl font-bold font-mono text-neutral-950 mt-0.5">{metrics.total}</div>
            <span className="text-[10px] text-neutral-400">Rows in sheet</span>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-md p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">Re-PSU (Revised)</span>
            <div className="text-xl font-bold font-mono text-amber-950 mt-0.5">{metrics.rePsuCount}</div>
            <span className="text-[10px] text-amber-600/80">v1, v2+ revisions</span>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-md p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">New Installs</span>
            <div className="text-xl font-bold font-mono text-emerald-950 mt-0.5">{metrics.newInstallsCount}</div>
            <span className="text-[10px] text-emerald-600/80">Initial setups</span>
          </div>

          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">Projects Monitored</span>
            <div className="text-xl font-bold font-mono text-neutral-950 mt-0.5">{metrics.uniqueProjects}</div>
            <span className="text-[10px] text-neutral-400">Distinct project IDs</span>
          </div>

          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">Active Schedulers</span>
            <div className="text-xl font-bold font-mono text-neutral-950 mt-0.5">{metrics.uniqueSchedulers}</div>
            <span className="text-[10px] text-neutral-400">Team members</span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-4 pt-3 border-t border-neutral-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search across all columns (project, scheduler, remarks...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-8 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 shadow-2xs font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-950"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            {/* Region Filter */}
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="h-9 px-3 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-950 shadow-2xs"
            >
              <option value="ALL">All Regions ({availableRegions.length})</option>
              {availableRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {/* Job Type Filter */}
            <select
              value={jobTypeFilter}
              onChange={(e) => setJobTypeFilter(e.target.value)}
              className="h-9 px-3 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-950 shadow-2xs"
            >
              <option value="ALL">All Job Types</option>
              <option value="Re-PSU (Revised)">Re-PSU (Revised)</option>
              <option value="New Installs">New Installs</option>
              {availableJobTypes
                .filter((jt) => jt !== 'Re-PSU (Revised)' && jt !== 'New Installs')
                .map((jt) => (
                  <option key={jt} value={jt}>
                    {jt}
                  </option>
                ))}
            </select>

            {/* Scheduler Filter */}
            <select
              value={schedulerFilter}
              onChange={(e) => setSchedulerFilter(e.target.value)}
              className="h-9 px-3 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-950 shadow-2xs"
            >
              <option value="ALL">All Schedulers ({availableSchedulers.length})</option>
              {availableSchedulers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {(regionFilter !== 'ALL' || jobTypeFilter !== 'ALL' || schedulerFilter !== 'ALL' || searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setRegionFilter('ALL');
                  setJobTypeFilter('ALL');
                  setSchedulerFilter('ALL');
                  setSearchTerm('');
                }}
                className="h-9 px-3 text-xs font-bold uppercase tracking-wider text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 rounded-sm transition-colors border border-rose-200 shadow-2xs"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {lastSyncTime && (
          <div className="mt-2 text-[10px] text-neutral-400 font-mono flex items-center justify-between uppercase tracking-wider">
            <span>Showing {filteredEntries.length} of {entries.length} entries</span>
            <span>Last synced: {lastSyncTime}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-md flex items-center justify-between text-xs text-amber-800 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{error}</span>
          </div>
          {onOpenAppsScriptSetup && (
            <button
              onClick={onOpenAppsScriptSetup}
              className="underline font-bold text-neutral-950 hover:text-black"
            >
              Configure Connection
            </button>
          )}
        </div>
      )}

      {/* Spreadsheet Mirror Grid */}
      <div className="bg-white border border-neutral-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* Mirror Grid Subtitle */}
        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between text-xs text-neutral-600">
          <div className="flex items-center space-x-2">
            <span className="font-bold uppercase tracking-wider text-neutral-950 text-[11px]">Mirror Table:</span>
            <span className="font-mono text-[11px] text-neutral-500">Columns A through M &bull; Real-time reflection</span>
          </div>
          <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider hidden sm:inline">
            Click row to inspect record
          </span>
        </div>

        {/* Scrollable Spreadsheet Table Container */}
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="min-w-full text-xs text-left border-collapse">
            {/* Header row with spreadsheet Column Letters & Labels */}
            <thead className="sticky top-0 bg-neutral-100 z-10 border-b border-neutral-200 shadow-2xs">
              <tr className="text-neutral-800 divide-x divide-neutral-200 text-[10px] font-bold uppercase tracking-wider">
                <th className="px-3 py-2.5 text-center font-mono font-bold bg-neutral-200/60 w-12 shrink-0 text-neutral-700">
                  #
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100">
                  <div className="text-[9px] text-neutral-400 font-mono">STATUS</div>
                  Monitoring
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[150px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL A</div>
                  Email Address
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[160px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL B</div>
                  Timestamp (MNL)
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[100px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL C</div>
                  Scheduler
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[110px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL D</div>
                  Region
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[120px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL E</div>
                  PSU Date (MNL)
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[120px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL F</div>
                  PSU Time (MNL)
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[130px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL G</div>
                  Project Number
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[90px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL H</div>
                  Version
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[140px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL I</div>
                  Job Type
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[120px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL J</div>
                  Study Type
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[140px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL K</div>
                  Email Category
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[180px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL L</div>
                  Sub-Category / Reason
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap bg-neutral-100 min-w-[200px]">
                  <div className="text-[9px] text-neutral-400 font-mono">COL M</div>
                  Remarks
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-neutral-200 bg-white">
              {isLoading && entries.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-12 text-center text-neutral-500">
                    <div className="inline-flex items-center gap-2 font-medium">
                      <RefreshCw className="w-4 h-4 animate-spin text-neutral-950" />
                      Fetching Google Sheet records from &quot;{sheetConfig.sheetName}&quot;...
                    </div>
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-12 text-center text-neutral-500">
                    <FileSpreadsheet className="w-10 h-10 text-neutral-400 mx-auto mb-2" />
                    <p className="font-bold text-neutral-950 uppercase tracking-wider text-xs">No matching sheet entries</p>
                    <p className="text-xs text-neutral-400 mt-1">
                      {searchTerm || regionFilter !== 'ALL' || jobTypeFilter !== 'ALL'
                        ? 'Try clearing active filters to see all rows.'
                        : 'Append your first PSU record from the entry tab to view it mirrored here!'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((row) => {
                  const isRev =
                    row.jobType === 'Re-PSU (Revised)' ||
                    row.jobType.toLowerCase().includes('rev') ||
                    isRevisedVersion(row.version);

                  return (
                    <tr
                      key={row.rowNumber}
                      onClick={() => setSelectedRow(row)}
                      className="hover:bg-neutral-50 cursor-pointer transition-colors divide-x divide-neutral-200 group"
                    >
                      {/* Row Index */}
                      <td className="px-3 py-2.5 text-center font-mono text-[11px] text-neutral-400 bg-neutral-50 group-hover:bg-neutral-100">
                        {row.rowNumber}
                      </td>

                      {/* Monitoring Status Badge */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {isRev ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-200">
                            Revised
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-900 border border-neutral-300">
                            New Install
                          </span>
                        )}
                      </td>

                      {/* Col A: Email Address */}
                      <td className="px-3 py-2.5 text-neutral-600 truncate max-w-[180px]" title={row.emailAddress}>
                        {row.emailAddress || '—'}
                      </td>

                      {/* Col B: Timestamp (MNL) */}
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono text-neutral-600 text-[11px]">
                        {row.timestampMnl || '—'}
                      </td>

                      {/* Col C: Scheduler */}
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-neutral-950">
                        {row.scheduler || '—'}
                      </td>

                      {/* Col D: Region */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-xs bg-neutral-100 text-neutral-800 text-[10px] font-bold font-mono uppercase border border-neutral-200">
                          {row.region || '—'}
                        </span>
                      </td>

                      {/* Col E: PSU Received Date (MNL) */}
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono text-neutral-950 font-semibold">
                        {row.psuReceivedDateMnl || '—'}
                      </td>

                      {/* Col F: PSU Received Time (MNL) */}
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono text-neutral-500 text-[11px]">
                        {row.psuReceivedTimeMnl || '—'}
                      </td>

                      {/* Col G: Project Number */}
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono font-bold text-neutral-950 bg-neutral-50/60">
                        {row.projectNumber || '—'}
                      </td>

                      {/* Col H: Version */}
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono">
                        {row.version ? (
                          <span
                            className={`px-1.5 py-0.5 rounded-xs text-[10px] font-bold border ${
                              isRevisedVersion(row.version)
                                ? 'bg-amber-100 text-amber-950 border-amber-300'
                                : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                            }`}
                          >
                            {row.version}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Col I: Job Type */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider border ${
                            row.jobType === 'Re-PSU (Revised)' || row.jobType.toLowerCase().includes('rev')
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-neutral-100 text-neutral-900 border-neutral-300'
                          }`}
                        >
                          {row.jobType || 'New Installs'}
                        </span>
                      </td>

                      {/* Col J: Study Type */}
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium text-neutral-950" title={row.studyType}>
                        {row.studyType || '—'}
                      </td>

                      {/* Col K: Email Category */}
                      <td className="px-3 py-2.5 truncate max-w-[160px] text-neutral-950 font-semibold" title={row.emailCategory}>
                        {row.emailCategory || '—'}
                      </td>

                      {/* Col L: Sub-Category / Description */}
                      <td className="px-3 py-2.5 truncate max-w-[180px] text-neutral-600" title={row.emailSubCategory}>
                        {row.emailSubCategory || '—'}
                      </td>

                      {/* Col M: Remarks */}
                      <td className="px-3 py-2.5 truncate max-w-[220px] text-neutral-600 text-[11px]" title={row.remarks}>
                        {row.remarks || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row Detail Inspector Modal */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl border border-neutral-300 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-md bg-neutral-950 text-white flex items-center justify-center font-bold text-xs font-mono">
                  #{selectedRow.rowNumber}
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-950 font-display flex items-center gap-2">
                    <span>Project {selectedRow.projectNumber}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-xs font-bold uppercase border ${
                        selectedRow.jobType === 'Re-PSU (Revised)'
                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                          : 'bg-neutral-100 text-neutral-900 border-neutral-300'
                      }`}
                    >
                      {selectedRow.jobType || 'New Installs'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-neutral-500 font-mono">
                    Google Sheet Row #{selectedRow.rowNumber} &bull; Version: {selectedRow.version || 'Initial'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="p-1.5 text-neutral-400 hover:text-neutral-950 hover:bg-neutral-100 rounded-sm transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid of details */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-neutral-50 rounded-md border border-neutral-200">
                <span className="text-[10px] text-neutral-400 uppercase font-mono block">Email Address</span>
                <span className="font-semibold text-neutral-950 break-all">{selectedRow.emailAddress || '—'}</span>
              </div>

              <div className="p-3 bg-neutral-50 rounded-md border border-neutral-200">
                <span className="text-[10px] text-neutral-400 uppercase font-mono block">Logged Timestamp (MNL)</span>
                <span className="font-mono text-neutral-600">{selectedRow.timestampMnl || '—'}</span>
              </div>

              <div className="p-3 bg-neutral-50 rounded-md border border-neutral-200">
                <span className="text-[10px] text-neutral-400 uppercase font-mono block">Scheduler</span>
                <span className="font-semibold text-neutral-950">{selectedRow.scheduler || '—'}</span>
              </div>

              <div className="p-3 bg-neutral-50 rounded-md border border-neutral-200">
                <span className="text-[10px] text-neutral-400 uppercase font-mono block">Region</span>
                <span className="font-mono font-semibold text-neutral-950">{selectedRow.region || '—'}</span>
              </div>

              <div className="p-3 bg-neutral-50 rounded-md border border-neutral-200">
                <span className="text-[10px] text-neutral-400 uppercase font-mono block">PSU Received Date</span>
                <span className="font-mono text-neutral-950 font-semibold">{selectedRow.psuReceivedDateMnl || '—'}</span>
              </div>

              <div className="p-3 bg-neutral-50 rounded-md border border-neutral-200">
                <span className="text-[10px] text-neutral-400 uppercase font-mono block">PSU Received Time</span>
                <span className="font-mono text-neutral-600">{selectedRow.psuReceivedTimeMnl || '—'}</span>
              </div>

              <div className="p-3 bg-neutral-50 rounded-md border border-neutral-200">
                <span className="text-[10px] text-neutral-400 uppercase font-mono block">Study / Study Type</span>
                <span className="font-semibold text-neutral-950">{selectedRow.studyType || '—'}</span>
              </div>

              <div className="p-3 bg-neutral-50 rounded-md border border-neutral-200">
                <span className="text-[10px] text-neutral-400 uppercase font-mono block">Email Category</span>
                <span className="text-neutral-950 font-semibold">{selectedRow.emailCategory || '—'}</span>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-md border border-neutral-200 text-xs">
              <span className="text-[10px] text-neutral-400 uppercase font-mono block">Email Sub-Category / Description</span>
              <p className="text-neutral-950 mt-0.5 leading-relaxed font-medium">{selectedRow.emailSubCategory || '—'}</p>
            </div>

            <div className="p-3 bg-neutral-50 rounded-md border border-neutral-200 text-xs">
              <span className="text-[10px] text-neutral-400 uppercase font-mono block">Remarks</span>
              <p className="text-neutral-950 mt-0.5 leading-relaxed whitespace-pre-wrap font-medium">{selectedRow.remarks || '—'}</p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() =>
                  handleCopyText(
                    `Project: ${selectedRow.projectNumber}\nScheduler: ${selectedRow.scheduler}\nRegion: ${selectedRow.region}\nJob Type: ${selectedRow.jobType}\nVersion: ${selectedRow.version}\nStudy: ${selectedRow.studyType}\nRemarks: ${selectedRow.remarks}`,
                    'modal'
                  )
                }
                className="px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-neutral-800 hover:text-neutral-950 bg-neutral-100 hover:bg-neutral-200 rounded-sm transition-colors flex items-center gap-1.5 border border-neutral-300 shadow-2xs"
              >
                {copiedField === 'modal' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied Record
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-neutral-500" /> Copy Record
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-neutral-950 hover:bg-neutral-800 active:bg-black rounded-sm transition-colors shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
