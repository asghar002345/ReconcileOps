import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  investigationStatusLabel,
  reviewDecisionLabel,
} from './investigationStatus.ts';

describe('investigation status labels', () => {
  it('uses sentence case instead of raw enums', () => {
    assert.equal(investigationStatusLabel('PENDING_APPROVAL'), 'Pending approval');
    assert.equal(investigationStatusLabel('RETURNED_TO_REVIEW'), 'Returned to review');
    assert.equal(reviewDecisionLabel('APPROVED'), 'Approved');
    assert.equal(reviewDecisionLabel('PENDING'), 'Pending');
  });
});
