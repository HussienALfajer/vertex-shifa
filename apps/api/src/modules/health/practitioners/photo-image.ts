import { createHash } from 'node:crypto';
import { DomainError, practitionerPhotoUpload } from '@vertex-shifa/contracts';
import sharp, { type Metadata } from 'sharp';

/** Refuses decoding anything larger than this many pixels (a decompression bomb). */
const MAX_INPUT_PIXELS = 25_000_000;

const FORMATS = new Set(['png', 'jpeg', 'webp']);

export type EncodedPhoto = {
  bytes: Buffer;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
};

const rejected = (reason: string) => new DomainError('FILE_REJECTED', `Photo rejected: ${reason}`);

/**
 * Decodes an uploaded doctor photo and re-encodes it as a square JPEG of at most 512 × 512,
 * centre-cropped, with every metadata block stripped (sharp writes none unless asked), so only
 * pixels we produced are stored and served (spec S02 rule 35). The upload's declared type is not
 * trusted: the decoder decides.
 */
export async function encodePhoto(upload: Buffer): Promise<EncodedPhoto> {
  const policy = practitionerPhotoUpload;
  if (upload.length === 0 || upload.length > policy.maxBytes) throw rejected('size');
  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' } as const;
  let metadata: Metadata;
  try {
    metadata = await sharp(upload, options).metadata();
  } catch {
    throw rejected('undecodable');
  }
  if (!metadata.format || !FORMATS.has(metadata.format)) throw rejected('format');
  const side = Math.min(policy.maxSide, metadata.width ?? 0, metadata.height ?? 0);
  if (side < policy.minSide) throw rejected('dimensions');
  const { data, info } = await sharp(upload, options)
    .rotate()
    .resize(side, side, { fit: 'cover', position: 'centre' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true })
    .catch(() => {
      throw rejected('undecodable');
    });
  if (info.width !== info.height || info.width < policy.minSide) throw rejected('dimensions');
  if (data.length > policy.maxStoredBytes) throw rejected('encoded size');
  return {
    bytes: data,
    byteSize: data.length,
    width: info.width,
    height: info.height,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}
