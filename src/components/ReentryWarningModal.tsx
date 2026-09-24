import React from 'react';
import { AlertTriangle, X, ArrowRight, Ban, Hash, History, GitBranch, Briefcase } from 'lucide-react';

export interface ExistingProjectReentryInfo {
  id?: string;
  projectNumber: string;
  existingCount: number;
  suggestedVersion: string;
  targetJobType?: string;
  sheetName?: string;
  study?: string;
  sourceFile?: string;
  source?: 'form_input' | 'file_parse';
}

interface ReentryWarningModalProps {
  isOpen: boolean;
  projects: ExistingProjectReentryInfo[];
  sheetName?: string;
  onCancel: () => void;
  onContinue: () => void;
}

export const ReentryWarningModal: React.FC<ReentryWarningModalProps> = ({
  isOpen,
  projects,
  sheetName = 'Project Tracker',
  onCancel,
  onContinue,
}) => {
  if (!isOpen || projects.length === 0) return null;

  const isMultiple = projects.length > 1;
  const primary = projects[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/65 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reentry-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-amber-300 w-full max-w-lg overflow-hidden transform transition-all animate-in zoom-in-95 duration-200">
        {/* Warning Header */}
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/15 border-b border-amber-200 px-6 py-4.5 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-50 stroke-[2.5]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 mb-1">
              <span>Warning: Reentry Detected</span>
            </div>
            <h2 id="reentry-modal-title" className="text-base font-bold text-neutral-900 leading-tight">
              {isMultiple
                ? `${projects.length} Existing Project Numbers Detected`
                : `Project ${primary.projectNumber} Already Exists`}
            </h2>
            <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
              Review the details below. Choose <span className="font-semibold text-neutral-900">Cancel</span> to cancel the reentry, or <span className="font-semibold text-neutral-900">Continue</span> to proceed with the new revision version.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg transition-colors"
            title="Cancel"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {/* List of Existing Projects */}
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {projects.map((proj, idx) => {
              const targetJob = proj.targetJobType || 'Re-PSU (Revised)';
              return (
                <div
                  key={proj.id || idx}
                  className="bg-neutral-50 rounded-xl border border-neutral-200 p-3.5 space-y-2.5 hover:border-amber-300 transition-colors"
                >
                  {/* Top line: Project Number & Count Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-900 font-bold text-[11px] flex items-center justify-center border border-amber-300 shrink-0">
                        <Hash className="w-3 h-3" />
                      </span>
                      <span className="font-mono text-sm font-extrabold text-neutral-900 tracking-wide">
                        {proj.projectNumber}
                      </span>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                      <History className="w-3 h-3 text-amber-700" />
                      <span>
                        {proj.existingCount} existing {proj.existingCount === 1 ? 'record' : 'records'}
                      </span>
                    </span>
                  </div>

                  {/* Transition Grid: Version and Job Type */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-neutral-200/80">
                    <div className="bg-white rounded-lg p-2 border border-neutral-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-0.5 flex items-center gap-1">
                        <GitBranch className="w-2.5 h-2.5" />
                        Next Version
                      </span>
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="text-neutral-400 line-through">Initial</span>
                        <ArrowRight className="w-3 h-3 text-amber-600 shrink-0" />
                        <span className="font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                          {proj.suggestedVersion}
                        </span>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg p-2 border border-neutral-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-0.5 flex items-center gap-1">
                        <Briefcase className="w-2.5 h-2.5" />
                        Job Type
                      </span>
                      <div className="flex items-center gap-1 font-medium text-xs text-neutral-900 truncate" title={targetJob}>
                        <span className="font-bold text-neutral-900">{targetJob}</span>
                      </div>
                    </div>
                  </div>

                  {/* Optional Study / Source note */}
                  {(proj.study || proj.sourceFile) && (
                    <div className="text-[11px] text-neutral-500 flex items-center gap-2 pt-0.5">
                      {proj.study && (
                        <span>
                          Study: <strong className="text-neutral-700">{proj.study}</strong>
                        </span>
                      )}
                      {proj.sourceFile && (
                        <span className="truncate" title={proj.sourceFile}>
                          • File: <span className="text-neutral-700">{proj.sourceFile}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer Buttons */}
        <div className="bg-neutral-50 border-t border-neutral-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold text-neutral-700 hover:text-neutral-950 bg-white hover:bg-neutral-100 rounded-xl border border-neutral-300 shadow-2xs transition-all flex items-center gap-1.5"
          >
            <Ban className="w-3.5 h-3.5 text-neutral-500" />
            <span>Cancel</span>
          </button>

          <button
            type="button"
            onClick={onContinue}
            className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl shadow-sm transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            <span>
              {isMultiple
                ? `Continue (${projects.length} Revisions)`
                : `Continue with ${primary.suggestedVersion}`}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
