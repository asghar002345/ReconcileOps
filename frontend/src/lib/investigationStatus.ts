import type { InvestigationStatus } from '../api/types';

const STATUS_LABELS: Record<InvestigationStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  PENDING_APPROVAL: 'Pending approval',
  RESOLVED: 'Resolved',
  RETURNED_TO_REVIEW: 'Returned to review',
};

export function investigationStatusLabel(status: InvestigationStatus): string {
  return STATUS_LABELS[status];
}

export function reviewDecisionLabel(
  status: 'PENDING' | 'APPROVED' | 'REJECTED',
): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
  }
}
