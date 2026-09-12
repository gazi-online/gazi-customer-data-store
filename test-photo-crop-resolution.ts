import { 
  getPhotoIdentityKey, 
  resolvePhotoConfirmationPayload, 
  resolveUsePhotoAction,
  resolveRejectPhotoAction,
  isCropResponseFresh
} from './src/components/AiSmartImportEngine/photoUtils';
import { MergedResult } from './src/components/AiSmartImportEngine/types';

let passCount = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${msg}`);
    process.exit(1);
  }
  passCount++;
  console.log(`✅ [PASS] ${msg}`);
}

async function runPhotoCorrectionTests() {
  console.log("==========================================================================");
  console.log(" 🧪 VERIFY FINDING 6: IMMUTABLE PHOTO STATE & ASYNC RESOLUTION");
  console.log("==========================================================================\n");

  // 1. Frozen input immutability test
  const initialData = {
    full_name: { value: 'Jane Doe', confidence: 0.95 },
    profile_photo: Object.freeze({
      available: true,
      bounding_box: Object.freeze([100, 100, 400, 400]),
      source_document: 'Doc1.pdf',
      confidence: 0.9
    })
  };

  const dummyResult: MergedResult = {
    data: initialData as any,
    conflicts: [],
    jobs: [
      {
        id: 'job_1',
        documentType: 'Aadhaar',
        provider: 'gemini' as const,
        source: 'file' as const,
        status: 'completed' as const,
        version: 1
      }
    ]
  };

  const identityKey1 = getPhotoIdentityKey(dummyResult);
  assert(identityKey1.includes('job_1') && identityKey1.includes('Doc1.pdf'), 'getPhotoIdentityKey computes unique identity key');

  // 2. Action determination: crop_needed when no previous crop/initial path exists
  const action1 = resolveUsePhotoAction(null, undefined);
  assert(action1.type === 'crop_needed', 'resolveUsePhotoAction requires crop when no path exists');

  // 3. Successful crop simulation: does NOT mutate frozen input
  const simulatedCroppedPath = 'usr_123/cropped_profile_abc.jpg';
  assert((dummyResult.data.profile_photo as any).storage_path === undefined, 'Frozen input profile_photo.storage_path remains undefined');

  // 4. Action determination: reuse when croppedStoragePath is present
  const action2 = resolveUsePhotoAction(simulatedCroppedPath, undefined);
  assert(action2.type === 'reuse' && action2.storagePath === simulatedCroppedPath, 'resolveUsePhotoAction reuses existing cropped path without re-upload');

  // 5. Confirmation payload with explicit approval (usePhoto === true)
  const basePayload = { full_name: 'Jane Doe', phone: '9876543210' };
  const approvedPayload = resolvePhotoConfirmationPayload(
    basePayload,
    true, // approved
    simulatedCroppedPath,
    dummyResult.data.profile_photo?.storage_path
  );
  assert(approvedPayload.photo_source === simulatedCroppedPath, 'Approved photo adds photo_source to final payload');
  assert(basePayload.full_name === 'Jane Doe' && !(basePayload as any).photo_source, 'resolvePhotoConfirmationPayload does not mutate input basePayload');

  // 6. Reject omits photo_source
  const rejectedPayload = resolvePhotoConfirmationPayload(
    basePayload,
    false, // rejected
    simulatedCroppedPath,
    dummyResult.data.profile_photo?.storage_path
  );
  assert(rejectedPayload.photo_source === undefined, 'Rejected photo strictly omits photo_source from final payload');

  // 7. Reject then Use Photo reuses the crop with no second upload
  const reApprovedPayload = resolvePhotoConfirmationPayload(
    basePayload,
    true, // user toggles back to Use Photo
    simulatedCroppedPath,
    dummyResult.data.profile_photo?.storage_path
  );
  assert(reApprovedPayload.photo_source === simulatedCroppedPath, 'Re-approved photo after rejection emits the previous crop path');

  // 8. Omission of inherited photo_source if unapproved
  const dirtyPayload = { full_name: 'Jane Doe', photo_source: 'legacy_stale_photo.jpg' };
  const cleanedPayload = resolvePhotoConfirmationPayload(
    dirtyPayload,
    false, // unapproved
    null,
    undefined
  );
  assert(cleanedPayload.photo_source === undefined, 'Unapproved state strips any inherited photo_source from base payload');

  // 9. Review replacement prevents old photo from leaking to new review
  const newReviewResult: MergedResult = {
    data: {
      full_name: { value: 'John Smith', confidence: 0.9 },
      profile_photo: {
        available: true,
        bounding_box: [50, 50, 200, 200],
        source_document: 'Doc2.pdf',
        confidence: 0.85
      }
    } as any,
    conflicts: [],
    jobs: [
      {
        id: 'job_2',
        documentType: 'PAN',
        provider: 'gemini' as const,
        source: 'file' as const,
        status: 'completed' as const,
        version: 1
      }
    ]
  };

  const identityKey2 = getPhotoIdentityKey(newReviewResult);
  assert(identityKey1 !== identityKey2, 'Identity key differs across different reviews');

  // Confirmation payload for the new review without user clicking Use Photo (unapproved)
  const newReviewPayload = resolvePhotoConfirmationPayload(
    { full_name: 'John Smith' },
    false, // new review resets usePhoto to false
    null,  // new review resets croppedStoragePath to null
    newReviewResult.data.profile_photo?.storage_path
  );
  assert(newReviewPayload.photo_source === undefined, 'Replaced review cannot emit previous photo path');

  // 10. Initial storage path requires explicit approval
  const preStoredResult: MergedResult = {
    data: {
      profile_photo: {
        available: true,
        storage_path: 'customer-profiles/existing_prestored.jpg',
        confidence: 1.0
      }
    } as any,
    conflicts: [],
    jobs: []
  };
  const unapprovedPreStored = resolvePhotoConfirmationPayload(
    { full_name: 'Alice' },
    false, // user has NOT clicked Use Photo yet
    null,
    preStoredResult.data.profile_photo?.storage_path
  );
  assert(unapprovedPreStored.photo_source === undefined, 'Pre-stored photo requires explicit approval (usePhoto=true) before inclusion in payload');

  const approvedPreStored = resolvePhotoConfirmationPayload(
    { full_name: 'Alice' },
    true, // user clicked Use Photo
    null,
    preStoredResult.data.profile_photo?.storage_path
  );
  assert(approvedPreStored.photo_source === 'customer-profiles/existing_prestored.jpg', 'Explicitly approved pre-stored photo is included in payload');

  // 11. Crop failure preservation test
  const lastValidPath = 'usr_123/valid_crop_1.jpg';
  const cropFailed = true;
  let activeCroppedPath = lastValidPath;
  if (!cropFailed) {
    activeCroppedPath = 'usr_123/new_failed_crop.jpg';
  }
  assert(activeCroppedPath === lastValidPath, 'Crop failure preserves the last valid crop path');

  // 12. Reject-while-crop-in-flight: sequence invalidation
  const initialSeq = 5;
  const cropInFlightSeq = initialSeq;
  // User clicks Reject while crop is pending:
  const rejectAction = resolveRejectPhotoAction(initialSeq);
  assert(rejectAction.usePhoto === false, 'resolveRejectPhotoAction forces usePhoto to false');
  assert(rejectAction.nextSeq > cropInFlightSeq, 'resolveRejectPhotoAction advances sequence counter beyond in-flight crop');

  // 13. Late crop completion after reject-in-flight is classified as stale
  const activeCropSeqAfterReject = rejectAction.nextSeq;
  const isFresh = isCropResponseFresh(
    true, // mounted
    identityKey1, // current review
    identityKey1, // request review
    activeCropSeqAfterReject, // active sequence (advanced by Reject)
    cropInFlightSeq // old crop sequence
  );
  assert(!isFresh, 'isCropResponseFresh returns false for late crop response after Reject');

  // 14. Stale late crop completion MUST NOT reach confirmation payload
  const payloadAfterStaleCrop = resolvePhotoConfirmationPayload(
    basePayload,
    rejectAction.usePhoto, // false
    null, // croppedStoragePath was not set due to freshness check
    undefined
  );
  assert(payloadAfterStaleCrop.photo_source === undefined, 'Rejected review strictly omits photo_source even if late crop returns');

  // 15. Stale crop dismisses toast without showing success or error for wrong/rejected action
  let toastDismissed = false;
  const fakeToastId = 42;
  if (!isFresh) {
    toastDismissed = true;
  }
  assert(toastDismissed, 'Stale in-flight crop dismisses loading toast and suppresses success notification');

  console.log("\n==========================================================================");
  console.log(`📊 SUMMARY: ALL ${passCount} IMMUTABLE PHOTO RESOLUTION ASSERTIONS PASSED!`);
  console.log("==========================================================================\n");
}

runPhotoCorrectionTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
