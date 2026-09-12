import { MergedResult } from './types';

export interface PhotoReviewState {
  photoUrl: string | null;
  usePhoto: boolean;
  isCroppingPhoto: boolean;
  croppedStoragePath: string | null;
}

/**
 * Computes the unique identity key for a review/photo context to detect replacement.
 * Uses available job IDs or source document + bounding box + storage path.
 */
export function getPhotoIdentityKey(result: MergedResult): string {
  const jobIds = (result.jobs || []).map(j => j.id).filter(Boolean).sort().join(',');
  const photo = result.data?.profile_photo;
  if (!photo) return `no-photo:${jobIds}`;
  const box = photo.bounding_box ? photo.bounding_box.join(':') : 'none';
  const doc = photo.source_document || 'doc';
  const initPath = photo.storage_path || 'none';
  return `${jobIds}|${doc}|${box}|${initPath}`;
}

/**
 * Resolves the final confirmation payload with immutable photo approval logic.
 *
 * Rules:
 * 1. Never mutates input objects.
 * 2. If photo is explicitly approved (usePhoto === true) AND an active path exists
 *    (croppedStoragePath || result.data.profile_photo?.storage_path),
 *    include photo_source in finalData.
 * 3. Otherwise (unapproved, rejected, or no usable path), omit photo_source entirely,
 *    and delete any existing photo_source property if present on the base payload.
 */
export function resolvePhotoConfirmationPayload(
  basePayload: Record<string, unknown>,
  usePhoto: boolean,
  croppedStoragePath: string | null,
  initialStoragePath?: string
): Record<string, unknown> {
  const finalData = { ...basePayload };
  const effectivePath = (croppedStoragePath || initialStoragePath || '').trim();

  if (usePhoto && effectivePath) {
    finalData.photo_source = effectivePath;
  } else {
    delete finalData.photo_source;
  }

  return finalData;
}

/**
 * Transition helper when user clicks 'Use Photo'.
 * Determines whether a crop upload is necessary or if an existing/cropped path can be reused.
 */
export function resolveUsePhotoAction(
  activeStoragePath: string | null,
  initialStoragePath?: string
): { type: 'reuse'; storagePath: string } | { type: 'crop_needed' } {
  const currentPath = activeStoragePath || initialStoragePath;
  if (currentPath && currentPath.trim() !== '') {
    return { type: 'reuse', storagePath: currentPath.trim() };
  }
  return { type: 'crop_needed' };
}

/**
 * State transition for user clicking Reject Photo.
 * Returns an invalidated sequence number (to supersede in-flight operations)
 * and sets usePhoto to false.
 */
export function resolveRejectPhotoAction(
  currentSeq: number
): { nextSeq: number; usePhoto: false } {
  return {
    nextSeq: currentSeq + 1,
    usePhoto: false,
  };
}

/**
 * Evaluates whether an async crop completion matches the current active state
 * and has not been superseded by review replacement, reject-in-flight, or later crops.
 */
export function isCropResponseFresh(
  isMounted: boolean,
  currentIdentity: string,
  requestIdentity: string,
  activeCropSeq: number,
  cropSeq: number
): boolean {
  return isMounted && currentIdentity === requestIdentity && activeCropSeq === cropSeq;
}
