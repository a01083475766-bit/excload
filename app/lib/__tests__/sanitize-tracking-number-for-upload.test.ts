import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTrackingNumberUploadHeader,
  sanitizeTrackingNumberForUpload,
} from '@/app/lib/sanitize-tracking-number-for-upload';

test('sanitizeTrackingNumberForUpload removes hyphens and spaces', () => {
  assert.equal(sanitizeTrackingNumberForUpload('1234-5678-9012'), '123456789012');
  assert.equal(sanitizeTrackingNumberForUpload(' 123 456 '), '123456');
  assert.equal(sanitizeTrackingNumberForUpload(''), '');
});

test('isTrackingNumberUploadHeader matches 송장번호·운송장번호', () => {
  assert.equal(isTrackingNumberUploadHeader('송장번호'), true);
  assert.equal(isTrackingNumberUploadHeader('운송장번호'), true);
  assert.equal(isTrackingNumberUploadHeader('상품주문번호'), false);
});
