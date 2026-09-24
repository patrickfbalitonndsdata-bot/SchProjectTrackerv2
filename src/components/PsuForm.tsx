import React, { useState, useEffect } from 'react';
import {
  Send,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  Globe,
  Hash,
  BookOpen,
  Briefcase,
  GitBranch,
  Tag,
  HelpCircle,
  MessageSquare,
  AlertCircle,
  Check,
  RefreshCw,
  ExternalLink,
  Mail,
  Plus,
  Trash2,
  Layers,
  Paperclip,
  Lock,
  ChevronDown,
  Sparkles,
  Eye,
} from 'lucide-react';
import { PsuFormData, SheetConfig, SheetEntryRow, AppendResult, ProjectItem, AttachmentInfo } from '../types';
import { appendPsuEntries, calculateProjectVersion, formatProjectVersion, FIXED_SPREADSHEET_URL, FIXED_SHEET_NAME } from '../lib/sheetsApi';
import { PdfViewerModal } from './PdfViewerModal';
import { ExistingProjectReentryInfo } from './ReentryWarningModal';
import {
  SCHEDULER_ROSTER,
  PSU_CATEGORIES,
  PSU_REASONS,
  CATEGORY_RECOMMENDED_REASONS,
  COMMON_REGIONS,
  JOB_TYPES,
  isRevisedVersion,
  STUDY_TYPE_KEYWORDS,
  normalizeStudyType,
  SECONDARY_STUDY_KEYWORDS,
} from '../lib/roster';

interface PsuFormProps {
  formData: PsuFormData;
  onChange: (data: PsuFormData) => void;
  onReset: () => void;
  sheetConfig: SheetConfig;
  userEmail: string;
  onSuccessAppend: (updatedRange: string) => void;
  onOpenAppsScriptSetup: () => void;
  onSyncSheetConfig?: (newConfig: SheetConfig) => void;
  accessToken?: string | null;
  recentEntries?: SheetEntryRow[];
  attachments?: AttachmentInfo[];
  onRequestReentryConfirm?: (projects: ExistingProjectReentryInfo[]) => Promise<boolean>;
  confirmedProjectsRef?: React.MutableRefObject<Set<string>>;
  onShowToast?: (msg: { title: string; desc: string }) => void;
}

export const PsuForm: React.FC<PsuFormProps> = ({
  formData,
  onChange,
  onReset,
  sheetConfig,
  userEmail,
  onSuccessAppend,
  onOpenAppsScriptSetup,
  onSyncSheetConfig,
  accessToken,
  recentEntries = [],
  attachments = [],
  onRequestReentryConfirm,
  confirmedProjectsRef,
  onShowToast,
}) => {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<AppendResult | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isCustomReason, setIsCustomReason] = useState<boolean>(false);
  const [openStudyPickerId, setOpenStudyPickerId] = useState<string | null>(null);
  const [showKeywordChips, setShowKeywordChips] = useState<boolean>(false);
  const [viewingAttachment, setViewingAttachment] = useState<AttachmentInfo | null>(null);
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);

  // Per-project version checking status map
  const [projectVersionStatuses, setProjectVersionStatuses] = useState<
    Record<string, { count: number; suggestedVersion: string; loading?: boolean }>
  >({});

  const fallbackConfirmedRef = React.useRef<Set<string>>(new Set());
  const confirmedProjects = confirmedProjectsRef || fallbackConfirmedRef;
  const typingTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasApiConnection = Boolean(sheetConfig.appsScriptUrl || accessToken);

  // Normalize projects list ensuring at least 1 project item exists
  const projectsList: ProjectItem[] =
    formData.projects && formData.projects.length > 0
      ? formData.projects
      : [
          {
            id: 'proj-1',
            projectNumber: formData.projectNumber || '',
            study: formData.study || '',
            version:
              formData.version
                ? formData.version.trim().toLowerCase() === 'initial'
                  ? 'Initial'
                  : formData.version
                : 'Initial',
            jobType: formData.jobType || 'New Installs',
          },
        ];

  // Helper to add another project
  const handleAddProject = () => {
    const newProject: ProjectItem = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectNumber: '',
      study: '',
      version: 'Initial',
      jobType: 'New Installs',
    };
    const updated = [...projectsList, newProject];
    onChange({
      ...formData,
      projects: updated,
    });
  };

  // Helper to remove a project
  const handleRemoveProject = (id: string) => {
    if (projectsList.length <= 1) return;
    const updated = projectsList.filter((p) => p.id !== id);
    const primary = updated[0];
    onChange({
      ...formData,
      projectNumber: primary?.projectNumber || '',
      study: primary?.study || '',
      version: primary?.version || '',
      jobType: primary?.jobType || 'New Installs',
      projects: updated,
    });
  };

  // Helper to update a project's field
  const handleUpdateProjectField = (id: string, field: keyof ProjectItem, value: string) => {
    const updated = projectsList.map((p) => {
      if (p.id !== id) return p;
      let finalVal = value;
      if (field === 'version' && value.trim().toLowerCase() === 'initial') {
        finalVal = 'Initial';
      }
      const modified = { ...p, [field]: finalVal };
      if (field === 'version') {
        const isRev = isRevisedVersion(finalVal);
        modified.jobType = isRev
          ? 'Re-PSU (Revised)'
          : modified.jobType === 'Re-PSU (Revised)'
          ? 'New Installs'
          : modified.jobType || 'New Installs';
      }
      return modified;
    });

    const primary = updated[0];
    onChange({
      ...formData,
      projectNumber: primary?.projectNumber || '',
      study: primary?.study || '',
      version: primary?.version || '',
      jobType: primary?.jobType || 'New Installs',
      projects: updated,
    });

    // If project number changed, debounce version check for this project
    if (field === 'projectNumber') {
      const trimmed = value.trim();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (trimmed.length >= 4) {
        typingTimeoutRef.current = setTimeout(() => {
          checkSingleProjectVersion(id, trimmed);
        }, 600);
      }
    }
  };

  // Check version against Google Sheet for a specific project
  const checkSingleProjectVersion = async (
    pId: string,
    pNumber: string,
    isSilentSync: boolean = false
  ) => {
    const trimmed = pNumber.trim();
    if (!trimmed) return;

    setProjectVersionStatuses((prev) => ({
      ...prev,
      [pId]: { ...(prev[pId] || { count: 0, suggestedVersion: '' }), loading: true },
    }));

    try {
      const { version, existingCount } = await calculateProjectVersion(
        sheetConfig.spreadsheetId,
        sheetConfig.sheetName || 'Project Tracker',
        trimmed,
        accessToken,
        sheetConfig.appsScriptUrl,
        recentEntries,
        formData.region
      );

      setProjectVersionStatuses((prev) => ({
        ...prev,
        [pId]: { count: existingCount, suggestedVersion: version, loading: false },
      }));

      const isAlreadyConfirmed = confirmedProjects.current.has(trimmed.toLowerCase());

      // If existing project detected in Google Sheet and not yet confirmed:
      // Show warning modal with Cancel (will not go through) or Continue (go through with new version)
      if (existingCount > 0 && !isAlreadyConfirmed && !isSilentSync && onRequestReentryConfirm) {
        const curProj = projectsList.find((p) => p.id === pId);
        const proceed = await onRequestReentryConfirm([
          {
            id: pId,
            projectNumber: trimmed,
            existingCount,
            suggestedVersion: version,
            targetJobType: 'Re-PSU (Revised)',
            sheetName: sheetConfig.sheetName,
            study: curProj?.study,
            sourceFile: curProj?.sourceFile,
            source: 'form_input',
          },
        ]);

        if (proceed) {
          // "Continue" which will have go through the new version (v1, v2 ... so on)
          confirmedProjects.current.add(trimmed.toLowerCase());
          const isRev = isRevisedVersion(version);
          const nextJobType = isRev ? 'Re-PSU (Revised)' : 'New Installs';

          const updated = projectsList.map((p) =>
            p.id === pId ? { ...p, projectNumber: trimmed, version, jobType: nextJobType } : p
          );
          const primary = updated[0];
          onChange({
            ...formData,
            projectNumber: primary?.projectNumber || '',
            study: primary?.study || '',
            version: primary?.version || '',
            jobType: primary?.jobType || 'New Installs',
            projects: updated,
          });
          onShowToast?.({
            title: 'Reentry Confirmed',
            desc: `Project ${trimmed} confirmed for revision ${version} (Job Type: Re-PSU (Revised)).`,
          });
          return;
        } else {
          // "Cancel" which will not go through: clear the project number
          confirmedProjects.current.delete(trimmed.toLowerCase());
          const updated = projectsList.map((p) =>
            p.id === pId ? { ...p, projectNumber: '', version: 'Initial', jobType: 'New Installs' } : p
          );
          const primary = updated[0];
          onChange({
            ...formData,
            projectNumber: primary?.projectNumber || '',
            study: primary?.study || '',
            version: primary?.version || 'Initial',
            jobType: primary?.jobType || 'New Installs',
            projects: updated,
          });
          setProjectVersionStatuses((prev) => {
            const next = { ...prev };
            delete next[pId];
            return next;
          });
          onShowToast?.({
            title: 'Reentry Cancelled',
            desc: `Project ${trimmed} cancelled. Project Number field cleared.`,
          });
          return;
        }
      }

      // Normal flow (initial or already confirmed)
      const currentProj = projectsList.find((item) => item.id === pId);
      if (
        currentProj &&
        (!currentProj.version ||
          currentProj.version.toLowerCase() === 'initial' ||
          /^v\d+$/i.test(currentProj.version) ||
          currentProj.version.startsWith('('))
      ) {
        const isRev = isRevisedVersion(version);
        const nextJobType = isRev
          ? 'Re-PSU (Revised)'
          : currentProj.jobType === 'Re-PSU (Revised)'
          ? 'New Installs'
          : currentProj.jobType || 'New Installs';

        const updated = projectsList.map((p) =>
          p.id === pId ? { ...p, version, jobType: nextJobType } : p
        );
        const primary = updated[0];
        onChange({
          ...formData,
          projectNumber: primary?.projectNumber || '',
          study: primary?.study || '',
          version: primary?.version || '',
          jobType: primary?.jobType || 'New Installs',
          projects: updated,
        });
      }
    } catch (err) {
      console.warn('Project version check error:', err);
      setProjectVersionStatuses((prev) => ({
        ...prev,
        [pId]: { ...(prev[pId] || { count: 0, suggestedVersion: '' }), loading: false },
      }));
    }
  };

  // Check versions for all projects when Region changes (silent sync)
  useEffect(() => {
    const timer = setTimeout(() => {
      projectsList.forEach((proj) => {
        if (proj.projectNumber && proj.projectNumber.trim()) {
          checkSingleProjectVersion(proj.id, proj.projectNumber.trim(), true);
        }
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [formData.region, sheetConfig.appsScriptUrl, sheetConfig.spreadsheetId, sheetConfig.sheetName]);

  const updateField = (field: keyof PsuFormData, value: string) => {
    if (field === 'category') {
      const isInitialCategory = value.trim().toLowerCase() === 'initial';
      if (isInitialCategory) {
        setIsCustomReason(false);
      }
      onChange({
        ...formData,
        category: value,
        reason: isInitialCategory ? 'Initial' : formData.reason,
      });
      return;
    }
    onChange({
      ...formData,
      [field]: value,
    });
  };

  const handleSchedulerSelect = (selectedName: string) => {
    if (!selectedName) {
      onChange({
        ...formData,
        scheduler: '',
        region: '',
      });
      return;
    }

    const matched = SCHEDULER_ROSTER.find(
      (s) => s.name.toLowerCase() === selectedName.toLowerCase()
    );

    const newRegion = matched?.region ? matched.region : '';

    onChange({
      ...formData,
      scheduler: matched ? matched.name : selectedName,
      region: newRegion,
    });
  };

  const isSheetReady = hasApiConnection;

  // Track all missing required fields before submission is allowed
  const missingFields: string[] = [];
  if (!formData.scheduler?.trim()) missingFields.push('Scheduler Name');
  if (!formData.region?.trim()) missingFields.push('Region');
  if (!formData.psuReceivedDate?.trim()) missingFields.push('PSU Received Date');
  if (!formData.psuReceivedTime?.trim()) missingFields.push('PSU Received Time');

  const hasIncompleteProjects =
    projectsList.length === 0 ||
    projectsList.some(
      (p) =>
        !p.projectNumber?.trim() ||
        !p.study?.trim() ||
        !p.version?.trim() ||
        !p.jobType?.trim()
    );
  if (hasIncompleteProjects) {
    missingFields.push('Project item(s) Project #, Study, Job Type, & Version');
  }

  if (!formData.category?.trim()) missingFields.push('Category');
  if (!formData.reason?.trim()) missingFields.push('Reason');

  const isAllFieldsFilled = missingFields.length === 0;
  const isSubmitEnabled = isSheetReady && isAllFieldsFilled && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionSuccess(null);
    setSubmissionResult(null);
    setSubmissionError(null);

    if (!hasApiConnection) {
      onOpenAppsScriptSetup();
      return;
    }

    if (!isAllFieldsFilled) {
      setSubmissionError(
        `Please fill out all required fields before submitting: ${missingFields.join(', ')}.`
      );
      return;
    }

    const validProjects = projectsList.filter(
      (p) => p.projectNumber && p.projectNumber.trim().length > 0
    );

    if (validProjects.length === 0) {
      setSubmissionError('At least one Project Number is required.');
      return;
    }

    // Safety check for unconfirmed duplicates before submission
    if (onRequestReentryConfirm) {
      const unconfirmedDups: ExistingProjectReentryInfo[] = [];
      for (const proj of validProjects) {
        const pNum = proj.projectNumber.trim();
        if (confirmedProjects.current.has(pNum.toLowerCase())) continue;
        const status = projectVersionStatuses[proj.id];
        if (status && status.count > 0) {
          unconfirmedDups.push({
            id: proj.id,
            projectNumber: pNum,
            existingCount: status.count,
            suggestedVersion: status.suggestedVersion,
            targetJobType: 'Re-PSU (Revised)',
            sheetName: sheetConfig.sheetName,
            study: proj.study,
            sourceFile: proj.sourceFile,
            source: 'form_input',
          });
        }
      }

      if (unconfirmedDups.length > 0) {
        const proceed = await onRequestReentryConfirm(unconfirmedDups);
        if (!proceed) {
          setSubmissionError('Submission cancelled due to existing Project Number reentry.');
          return;
        }
        unconfirmedDups.forEach((p) => confirmedProjects.current.add(p.projectNumber.trim().toLowerCase()));
      }
    }

    // Default remarks to "N/A" if left blank by user
    const finalRemarks = formData.remarks?.trim() || 'N/A';

    setIsSubmitting(true);
    try {
      const targetSheetName = (sheetConfig.sheetName && sheetConfig.sheetName !== 'Scheduling Submission')
        ? sheetConfig.sheetName
        : FIXED_SHEET_NAME;

      const res = await appendPsuEntries(
        sheetConfig.spreadsheetId,
        targetSheetName,
        {
          ...formData,
          remarks: finalRemarks,
          projects: validProjects,
        },
        userEmail,
        accessToken,
        sheetConfig.appsScriptUrl,
        sheetConfig.spreadsheetUrl
      );

      setSubmissionResult(res);
      const rowCount = res.updatedRows || validProjects.length;
      if (rowCount > 1) {
        setSubmissionSuccess(
          `Successfully logged ${rowCount} project entries to "${res.sheetName || targetSheetName}" in Google Sheets! (Range: ${res.updatedRange})`
        );
      } else {
        setSubmissionSuccess(
          `Successfully logged entry to "${res.sheetName || targetSheetName}" in Google Sheets! (Range: ${res.updatedRange})`
        );
      }
      setProjectVersionStatuses({});
      setIsCustomReason(false);
      confirmedProjects.current.clear();
      onSuccessAppend(res.updatedRange);

      setTimeout(() => {
        setSubmissionSuccess(null);
      }, 5000);
    } catch (err: any) {
      console.error('Submission error:', err);
      setSubmissionError(err.message || 'Failed to append row(s) to Google Sheets.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 shadow-2xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-neutral-200 gap-2">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-950 font-display flex items-center gap-2">
            <span>PSU Entry Submission Form</span>
            <span className="px-2 py-0.5 text-[9px] font-bold bg-neutral-100 text-neutral-800 rounded-xs border border-neutral-300 uppercase">
              Live Mirror
            </span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Review and finalize the parsed data before appending to your Google Sheet database.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            id="reset-form-btn"
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-neutral-700 hover:text-neutral-950 bg-neutral-100 hover:bg-neutral-200 rounded-sm border border-neutral-300 shadow-2xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-neutral-500" /> Reset Form
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        {/* Row 1: Personnel & Region (3 Balanced Columns) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="email-address-input" className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-neutral-950" />
              Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              id="email-address-input"
              type="email"
              required
              placeholder="e.g., Chantel.Campa@ndsdata.com"
              value={formData.emailAddress}
              onChange={(e) => updateField('emailAddress', e.target.value)}
              className="w-full h-10 px-3.5 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 font-medium shadow-2xs"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="scheduler-select" className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-neutral-950" />
                Scheduler Name <span className="text-rose-500">*</span>
              </label>
              {formData.scheduler && (
                <button
                  type="button"
                  onClick={() => onChange({ ...formData, scheduler: '', region: '' })}
                  className="text-[10px] text-neutral-500 hover:text-neutral-950 underline"
                >
                  Clear
                </button>
              )}
            </div>
            <select
              id="scheduler-select"
              required
              value={formData.scheduler}
              onChange={(e) => handleSchedulerSelect(e.target.value)}
              className="w-full h-10 px-3.5 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 font-medium shadow-2xs"
            >
              <option value="">-- Pick Scheduler --</option>
              {SCHEDULER_ROSTER.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
              {formData.scheduler && !SCHEDULER_ROSTER.some((s) => s.name.toLowerCase() === formData.scheduler.toLowerCase()) && (
                <option value={formData.scheduler}>{formData.scheduler}</option>
              )}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="region-input" className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-neutral-950" />
                Region <span className="text-rose-500">*</span>
              </label>
              {formData.region && (
                <button
                  type="button"
                  onClick={() => updateField('region', '')}
                  className="text-[10px] text-neutral-500 hover:text-neutral-950 underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="region-input"
                type="text"
                list="common-regions-list"
                required
                placeholder="Pick from list or enter region manually..."
                value={formData.region}
                onChange={(e) => updateField('region', e.target.value)}
                className="w-full h-10 px-3.5 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 shadow-2xs"
              />
              <datalist id="common-regions-list">
                {COMMON_REGIONS.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </datalist>
            </div>
          </div>
        </div>

        {/* Row 2: Timing Details (2 Columns) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="psu-date-input" className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-neutral-950" />
              PSU Received Date (MNL) <span className="text-rose-500">*</span>
            </label>
            <input
              id="psu-date-input"
              type="date"
              required
              value={formData.psuReceivedDate}
              onChange={(e) => updateField('psuReceivedDate', e.target.value)}
              className="w-full h-10 px-3.5 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 font-mono focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 shadow-2xs"
            />
          </div>

          <div>
            <label htmlFor="psu-time-input" className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-neutral-950" />
              PSU Received Time (MNL) <span className="text-rose-500">*</span>
            </label>
            <input
              id="psu-time-input"
              type="text"
              required
              placeholder="e.g., 4:45 PM"
              value={formData.psuReceivedTime}
              onChange={(e) => updateField('psuReceivedTime', e.target.value)}
              className="w-full h-10 px-3.5 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 font-mono focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 shadow-2xs"
            />
          </div>
        </div>

        {/* Dynamic Multiple Projects Section */}
        <div className="border border-neutral-200 rounded-xl p-4 sm:p-5 bg-neutral-50/80 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-neutral-950 text-white rounded-md shadow-2xs">
                <Layers className="w-4 h-4" />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-950 font-display flex items-center gap-2">
                <span>Project Details</span>
                <span className="px-2 py-0.5 text-[9px] font-bold bg-neutral-950 text-white rounded-xs uppercase">
                  {projectsList.length} {projectsList.length === 1 ? 'Project' : 'Projects'}
                </span>
              </h3>
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setShowKeywordChips((prev) => !prev)}
                className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold tracking-wide px-2.5 py-1 h-7 rounded-sm border transition-colors ${
                  showKeywordChips
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300 shadow-2xs'
                }`}
                title="Toggle standard traffic study keywords bar"
              >
                <Sparkles className="w-3 h-3 text-[#DFC772]" />
                <span>Study Keywords</span>
                <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showKeywordChips ? 'rotate-180' : ''}`} />
              </button>

              <button
                id="add-project-btn"
                type="button"
                onClick={handleAddProject}
                className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold tracking-wide px-2.5 py-1 h-7 bg-neutral-900 hover:bg-neutral-800 text-white rounded-sm shadow-2xs transition-all"
              >
                <Plus className="w-3 h-3 text-neutral-300" />
                <span>Add Another Project</span>
              </button>
            </div>
          </div>

          {/* Quick-Access Standard Study Keywords Toolbar */}
          {showKeywordChips && (
            <div className="p-3 bg-white border border-[#E8E3D5] rounded-xl shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#16241C] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#C1A84C]" />
                  Recognized Study Types (Click to fill first project or matching row):
                </span>
                <span className="text-[10px] text-[#8CA0A3] font-medium">{STUDY_TYPE_KEYWORDS.length} Official Keywords</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STUDY_TYPE_KEYWORDS.map((kw) => {
                  const isUsed = projectsList.some((p) => p.study === kw);
                  return (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => {
                        // Fill active project or first project with empty study, or project #1
                        const targetProj = projectsList.find((p) => !p.study.trim()) || projectsList[0];
                        if (targetProj) {
                          handleUpdateProjectField(targetProj.id, 'study', kw);
                        }
                      }}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1 ${
                        isUsed
                          ? 'bg-[#334E3D] text-[#FFF8EE] border-[#334E3D] shadow-2xs font-semibold'
                          : 'bg-[#F8F6F0] hover:bg-[#FFF8EE] text-[#16241C] border-[#E8E3D5]'
                      }`}
                      title={`Select ${kw}`}
                    >
                      <span>{kw}</span>
                      {isUsed && <Check className="w-2.5 h-2.5 text-[#88D49E]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* List of Projects */}
          <div className="space-y-3">
            {projectsList.map((project, index) => {
              const status = projectVersionStatuses[project.id];
              const isChecking = status?.loading;

              return (
                <div
                  key={project.id}
                  id={`project-row-${index}`}
                  className="bg-white border border-[#E8E3D5] rounded-xl p-3.5 shadow-2xs space-y-3"
                >
                  {/* Card Mini Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#FDEDD4] text-[#334E3D] font-bold text-[11px] flex items-center justify-center border border-[#E5D0A1]">
                        {index + 1}
                      </span>
                      <span className="text-xs font-bold text-[#16241C]">
                        Project #{index + 1}
                      </span>
                      {project.sourceFile && (
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-[#FDEDD4]/60 text-[#334E3D] border border-[#E5D0A1] rounded-md truncate max-w-[200px]"
                            title={`Extracted from PDF attachment: ${project.sourceFile}`}
                          >
                            <Paperclip className="w-2.5 h-2.5 shrink-0 text-[#C1A84C]" />
                            <span className="truncate">{project.sourceFile}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const matched =
                                attachments.find((a) => a.fileName === project.sourceFile) ||
                                attachments.find((a) => a.isPdf) ||
                                null;
                              if (matched) {
                                setViewingAttachment(matched);
                                setViewingProjectId(project.id);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-[#334E3D] hover:bg-[#223529] text-[#FFF8EE] rounded shadow-2xs transition-colors"
                            title="View PDF attachment and check Page 1 extraction"
                          >
                            <Eye className="w-2.5 h-2.5" />
                            <span>View PDF</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {projectsList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveProject(project.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-[#8CA0A3] hover:text-red-600 transition-colors p-1"
                        title="Remove this project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Remove</span>
                      </button>
                    )}
                  </div>

                  {/* 4 Inputs: Project Number, Study, Version, Job Type */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Project Number */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 h-5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5 whitespace-nowrap">
                          <Hash className="w-3 h-3 text-neutral-950 shrink-0" />
                          <span>Project Number</span> <span className="text-rose-500">*</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="e.g., 26-770124"
                        value={project.projectNumber}
                        onChange={(e) =>
                          handleUpdateProjectField(project.id, 'projectNumber', e.target.value)
                        }
                        onBlur={() => {
                          if (project.projectNumber && project.projectNumber.trim().length >= 4) {
                            checkSingleProjectVersion(project.id, project.projectNumber.trim());
                          }
                        }}
                        className="w-full h-9.5 px-3 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 font-mono shadow-2xs"
                      />
                    </div>

                    {/* Study / Study Type */}
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1.5 h-5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5 whitespace-nowrap">
                          <BookOpen className="w-3 h-3 text-neutral-950 shrink-0" />
                          <span>Study / Study Type</span>
                        </label>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          list="study-types-datalist"
                          placeholder="e.g., TMC, ATR, Radar..."
                          value={project.study}
                          onChange={(e) =>
                            handleUpdateProjectField(project.id, 'study', e.target.value)
                          }
                          onBlur={(e) => {
                            const norm = normalizeStudyType(e.target.value);
                            if (norm && norm !== e.target.value) {
                              handleUpdateProjectField(project.id, 'study', norm);
                            }
                          }}
                          className="w-full h-9.5 px-3 pr-7 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 font-medium shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() => setOpenStudyPickerId(openStudyPickerId === project.id ? null : project.id)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-950"
                          title="Open Keywords list"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Dropdown Popover for Standard Study Keywords */}
                      {openStudyPickerId === project.id && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-neutral-300 rounded-lg shadow-xl p-2 max-h-60 overflow-y-auto space-y-1">
                          <div className="flex items-center justify-between pb-1 border-b border-neutral-200 px-1">
                            <span className="text-[10px] font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-[#DFC772]" />
                              Official Keywords
                            </span>
                            <button
                              type="button"
                              onClick={() => setOpenStudyPickerId(null)}
                              className="text-[10px] text-neutral-500 hover:text-neutral-950 font-bold uppercase"
                            >
                              Close
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-0.5 pt-1">
                            {STUDY_TYPE_KEYWORDS.map((kw) => (
                              <button
                                key={kw}
                                type="button"
                                onClick={() => {
                                  handleUpdateProjectField(project.id, 'study', kw);
                                  setOpenStudyPickerId(null);
                                }}
                                className={`text-left px-2.5 py-1.5 text-xs rounded transition-colors flex items-center justify-between ${
                                  project.study === kw
                                    ? 'bg-neutral-950 text-white font-bold'
                                    : 'hover:bg-neutral-100 text-neutral-900'
                                }`}
                              >
                                <span className="truncate">{kw}</span>
                                {project.study === kw && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Version */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 h-5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5 whitespace-nowrap">
                          <GitBranch className="w-3 h-3 text-neutral-950 shrink-0" />
                          <span>Version</span>
                        </label>
                        {project.projectNumber.trim() && (
                          <button
                            type="button"
                            onClick={() =>
                              checkSingleProjectVersion(project.id, project.projectNumber)
                            }
                            disabled={isChecking}
                            className="inline-flex items-center gap-1 text-[10px] text-neutral-950 hover:underline shrink-0 font-bold uppercase tracking-wider"
                            title="Query sheet history for this project"
                          >
                            <RefreshCw
                              className={`w-2.5 h-2.5 ${isChecking ? 'animate-spin text-amber-500' : ''}`}
                            />
                            Sync
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Initial, v2, v3, ..."
                        value={project.version}
                        onChange={(e) =>
                          handleUpdateProjectField(project.id, 'version', e.target.value)
                        }
                        onBlur={(e) => {
                          if (e.target.value.trim().toLowerCase() === 'initial' && e.target.value !== 'Initial') {
                            handleUpdateProjectField(project.id, 'version', 'Initial');
                          }
                        }}
                        className="w-full h-9.5 px-3 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 font-mono font-medium shadow-2xs"
                      />
                      {/* Version status pill (only shown when actively checking or dynamically returned) */}
                      {isChecking ? (
                        <span className="text-[10px] text-neutral-500 mt-1 block animate-pulse leading-tight">
                          Checking sheet...
                        </span>
                      ) : status ? (
                        <span className="text-[10px] mt-1 block font-medium leading-tight truncate">
                          {status.count === 0 ? (
                            <span className="text-emerald-700 font-semibold">
                              1st entry &rarr; <strong>{status.suggestedVersion}</strong>
                            </span>
                          ) : (
                            <span className="text-amber-800 font-semibold inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                              <span>{status.count} prior &rarr; <strong>{status.suggestedVersion}</strong> (Re-PSU)</span>
                            </span>
                          )}
                        </span>
                      ) : null}
                    </div>

                    {/* Job Type */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 h-5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5 whitespace-nowrap">
                          <Briefcase className="w-3 h-3 text-neutral-950 shrink-0" />
                          <span>Job Type</span> <span className="text-rose-500">*</span>
                        </label>
                      </div>
                      <select
                        required
                        value={project.jobType || 'New Installs'}
                        onChange={(e) =>
                          handleUpdateProjectField(project.id, 'jobType', e.target.value)
                        }
                        className="w-full h-9.5 px-3 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 font-medium shadow-2xs"
                      >
                        {JOB_TYPES.map((jt) => (
                          <option key={jt} value={jt}>
                            {jt}
                          </option>
                        ))}
                        {project.jobType && !JOB_TYPES.includes(project.jobType) && (
                          <option value={project.jobType}>{project.jobType}</option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Add Another Project Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleAddProject}
              className="w-full py-2.5 border border-dashed border-neutral-300 hover:border-neutral-950 hover:bg-neutral-100 text-neutral-950 rounded-md text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-neutral-950" />
              <span>+ Add Another Project Number, Study Type &amp; Version</span>
            </button>
          </div>
        </div>

        {/* Row 3: Category (Email Category) */}
        <div>
          <label htmlFor="category-select" className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1.5 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-neutral-950" />
            Category (Email Category) <span className="text-rose-500">*</span>
          </label>
          <select
            id="category-select"
            required
            value={formData.category}
            onChange={(e) => updateField('category', e.target.value)}
            className="w-full h-10 px-3.5 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 font-medium shadow-2xs"
          >
            <option value="">(Select Category)</option>
            {PSU_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
            {formData.category && !PSU_CATEGORIES.includes(formData.category) && (
              <option value={formData.category}>{formData.category}</option>
            )}
          </select>
        </div>

        {/* Row 4: Reason (Email Sub-Category / Description) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor={isCustomReason ? "reason-input" : "reason-select"} className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-neutral-950" />
              Reason (Email Sub-Category / Description) <span className="text-rose-500">*</span>
            </label>
            {formData.category && (
              <button
                type="button"
                onClick={() => setIsCustomReason(!isCustomReason)}
                className="text-[10px] text-neutral-950 hover:underline font-bold uppercase tracking-wider transition-colors"
              >
                {isCustomReason ? 'Choose from list' : 'Type custom reason'}
              </button>
            )}
          </div>

          {isCustomReason ? (
            <input
              id="reason-input"
              type="text"
              required
              placeholder={
                formData.category
                  ? 'Enter custom reason or description...'
                  : 'Please select a Category above first...'
              }
              value={formData.reason}
              onChange={(e) => updateField('reason', e.target.value)}
              disabled={!formData.category}
              className={`w-full h-10 px-3.5 text-xs border rounded-md font-medium shadow-2xs focus:outline-none transition-colors ${
                !formData.category
                  ? 'bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed'
                  : 'bg-white border-neutral-300 text-neutral-950 focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 placeholder:text-neutral-400'
              }`}
            />
          ) : (
            <select
              id="reason-select"
              required
              value={formData.reason}
              disabled={!formData.category}
              onChange={(e) => {
                if (e.target.value === '__OTHER_CUSTOM__') {
                  setIsCustomReason(true);
                  updateField('reason', '');
                } else {
                  updateField('reason', e.target.value);
                }
              }}
              className={`w-full h-10 px-3.5 text-xs border rounded-md font-medium shadow-2xs focus:outline-none transition-colors ${
                !formData.category
                  ? 'bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed'
                  : 'bg-white border-neutral-300 text-neutral-950 focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950'
              }`}
            >
              {!formData.category ? (
                <option value="">(Please select a Category above first)</option>
              ) : (
                <>
                  <option value="">(Select Reason)</option>
                  {(() => {
                    const recommendedList = CATEGORY_RECOMMENDED_REASONS[formData.category] || [];
                    const otherList = PSU_REASONS.filter((r) => !recommendedList.includes(r));
                    return (
                      <>
                        {recommendedList.length > 0 && (
                          <optgroup label={`⭐ Recommended for "${formData.category}"`}>
                            {recommendedList.map((r) => (
                              <option key={`rec-${r}`} value={r}>
                                ⭐ {r}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup
                          label={
                            recommendedList.length > 0
                              ? 'Other Available Reasons'
                              : 'All Reasons'
                          }
                        >
                          {otherList.map((r) => (
                            <option key={`other-${r}`} value={r}>
                              {r}
                            </option>
                          ))}
                        </optgroup>
                      </>
                    );
                  })()}
                  {formData.reason &&
                    !PSU_REASONS.includes(formData.reason) && (
                      <option value={formData.reason}>{formData.reason}</option>
                    )}
                  <option value="__OTHER_CUSTOM__">+ Other (Type custom reason)...</option>
                </>
              )}
            </select>
          )}
        </div>

        {/* Row 5: Remarks */}
        <div>
          <label htmlFor="remarks-input" className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1.5 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-neutral-950" />
            Remarks
          </label>
          <textarea
            id="remarks-input"
            rows={3}
            placeholder="Enter any remarks, special scheduling requirements, or notes (optional)..."
            value={formData.remarks}
            onChange={(e) => updateField('remarks', e.target.value)}
            className="w-full p-3.5 text-xs border border-neutral-300 rounded-md bg-white text-neutral-950 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:border-neutral-950 resize-none font-normal shadow-2xs"
          />
        </div>

        {/* User Email Row */}
        <div className="text-xs text-neutral-600 flex items-center justify-between pt-1 font-medium">
          <span>
            Logging as: <strong className="text-neutral-950 font-bold">{formData.emailAddress || userEmail || 'Current User'}</strong>
          </span>
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">
            Timestamp (MNL) auto-logged
          </span>
        </div>

        {/* Alerts */}
        {submissionError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-xs text-red-700 shadow-2xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold uppercase tracking-wider text-red-900">Submission Error: </span>
              <p className="leading-relaxed text-red-800">{submissionError}</p>
            </div>
          </div>
        )}

        {submissionSuccess && (
          <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between gap-3 text-white shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </span>
              <span className="font-bold text-xs uppercase tracking-wider text-white font-display">
                Submission Successful
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSubmissionSuccess(null)}
              className="text-neutral-400 hover:text-white text-xs px-2 py-0.5 rounded-sm hover:bg-neutral-800 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Submit Button (Modern, eye-catching, high-contrast) */}
        <div className="pt-2">
          <button
            id="submit-psu-btn"
            type="submit"
            disabled={!isSubmitEnabled}
            className={`w-full py-4 px-6 rounded-sm text-xs font-extrabold uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 transition-all duration-150 ${
              isSubmitEnabled
                ? 'bg-neutral-950 hover:bg-neutral-800 active:bg-black text-white shadow-md hover:shadow-lg active:scale-[0.99] cursor-pointer'
                : 'bg-neutral-200 text-neutral-400 border border-neutral-300 cursor-not-allowed select-none'
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {projectsList.length > 1
                  ? `Submitting ${projectsList.length} Entries to Google Sheets...`
                  : 'Submitting Entry to Google Sheets...'}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 text-[#DFC772]" />
                {isSheetReady
                  ? projectsList.length > 1
                    ? `Submit ${projectsList.length} Projects to Google Sheet (${sheetConfig.sheetName})`
                    : `Submit Entry to Google Sheet (${sheetConfig.sheetName})`
                  : 'Setup Apps Script API to Submit'}
              </>
            )}
          </button>

          {/* Missing Fields Notice */}
          {isSheetReady && !isAllFieldsFilled && (
            <div className="mt-3 p-3 bg-neutral-100 border border-neutral-300 rounded-sm text-xs text-neutral-700 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-neutral-950 uppercase tracking-wider text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Submit Entry is locked until all required fields are completed:</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-0.5">
                {missingFields.map((field) => (
                  <span
                    key={field}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-neutral-300 rounded-xs text-neutral-900 font-medium text-[11px] shadow-2xs"
                  >
                    • {field}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!isSheetReady && (
            <p className="text-center text-[11px] text-neutral-500 mt-2">
              Please click{' '}
              <button
                type="button"
                onClick={onOpenAppsScriptSetup}
                className="text-neutral-950 font-bold underline hover:text-black"
              >
                Setup Apps Script API
              </button>{' '}
              to connect your Google Sheet without sign-in requirements.
            </p>
          )}

          {/* Datalist autocomplete for all standard study keywords */}
          <datalist id="study-types-datalist">
            {STUDY_TYPE_KEYWORDS.map((kw) => (
              <option key={kw} value={kw} />
            ))}
            {SECONDARY_STUDY_KEYWORDS.map((sec) => (
              <option key={sec} value={sec} />
            ))}
          </datalist>
        </div>
      </form>

      {/* PDF Attachment Modal Viewer */}
      <PdfViewerModal
        isOpen={Boolean(viewingAttachment)}
        onClose={() => {
          setViewingAttachment(null);
          setViewingProjectId(null);
        }}
        attachment={viewingAttachment}
        onUpdateExtracted={(updated) => {
          if (viewingProjectId) {
            if (updated.projectNumber) {
              handleUpdateProjectField(viewingProjectId, 'projectNumber', updated.projectNumber);
            }
            if (updated.study) {
              handleUpdateProjectField(viewingProjectId, 'study', updated.study);
            }
          }
          if (updated.region && !formData.region) {
            updateField('region', updated.region);
          }
        }}
      />
    </div>
  );
};
