import { createHash } from 'node:crypto';
import { DomainError, logoUpload } from '@vertex-shifa/contracts';
import sharp from 'sharp';

/** Refuses decoding anything larger than this many pixels (a decompression bomb). */
const MAX_INPUT_PIXELS = 25_000_000;

const FORMATS = new Set(['png', 'jpeg', 'webp']);

export type EncodedLogo = {
  bytes: Buffer;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
};

const rejected = (reason: string) => new DomainError('FILE_REJECTED', `Logo rejected: ${reason}`);

/**
 * Decodes an uploaded logo and re-encodes it as a PNG that fits 512 × 512, with every metadata
 * block stripped (sharp writes none unless asked), so only pixels we produced are stored and
 * served (S01 rule 14). The upload's declared type is not trusted: the decoder decides.
 */
export async function encodeLogo(upload: Buffer): Promise<EncodedLogo> {
  if (upload.length === 0 || upload.length > logoUpload.maxBytes) throw rejected('size');
  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' } as const;
  let format: string | undefined;
  try {
    ({ format } = await sharp(upload, options).metadata());
  } catch {
    throw rejected('undecodable');
  }
  if (!format || !FORMATS.has(format)) throw rejected('format');
  const { data, info } = await sharp(upload, options)
    .rotate()
    .resize(logoUpload.maxSide, logoUpload.maxSide, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true })
    .catch(() => {
      throw rejected('undecodable');
    });
  if (info.width < logoUpload.minSide || info.height < logoUpload.minSide) {
    throw rejected('dimensions');
  }
  if (data.length > logoUpload.maxStoredBytes) throw rejected('encoded size');
  return {
    bytes: data,
    byteSize: data.length,
    width: info.width,
    height: info.height,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}
