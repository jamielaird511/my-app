// src/components/RefineModal.tsx
import React from 'react';
import { RefineCandidate } from '@/lib/estimate/refine';

interface RefineModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: RefineCandidate[];
  onSelectCandidate: (candidate: RefineCandidate) => void;
  loading?: boolean;
}

export default function RefineModal({
  isOpen,
  onClose,
  candidates,
  onSelectCandidate,
  loading = false,
}: RefineModalProps) {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSelect = (candidate: RefineCandidate) => {
    onSelectCandidate(candidate);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Refine to 10-digit HS
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Finding candidates...</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.47-.881-6.08-2.33" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No close matches found</h3>
              <p className="text-gray-600 mb-4">
                We couldn&apos;t find any 10-digit HS codes that closely match your input.
              </p>
              <a
                href="/hs"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
              >
                Search HS Lookup
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">
                Select the most accurate 10-digit HS code for your product:
              </p>
              
              {candidates.map((candidate, index) => (
                <div
                  key={candidate.code10}
                  className="border rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-mono text-lg text-gray-900 mb-1">
                        {candidate.code10.replace(/(\d{4})(\d{2})(\d{4})/, '$1.$2.$3')}
                      </div>
                      <div className="text-sm text-gray-700 mb-2">
                        {candidate.description}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                  <span className="text-xs text-gray-500">
                          {(candidate.confidence * 100).toFixed(0)}% confidence
                        </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSelect(candidate)}
                      className="shrink-0 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                    >
                      Use this code
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
