/**
 * FileSignatureValidator
 * Lightweight deterministic magic-byte, central directory, and OOXML container validation.
 * Ensures uploaded files match their claimed extension and container structure
 * before being sent to preprocessors or AI providers.
 *
 * Implements strict ZIP bomb / resource limits:
 * - Maximum entry count: 500
 * - Maximum single-entry uncompressed size: 20 MB
 * - Maximum total uncompressed size: 50 MB
 * - Maximum compression ratio: 50:1
 * - In-memory parsing without extracting archive contents to disk
 */

export interface SignatureValidationResult {
  valid: boolean;
  format?: string;
  reason?: string;
}

export interface ZipSafetyLimits {
  maxEntryCount: number;
  maxSingleEntryBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
}

export const DEFAULT_ZIP_SAFETY_LIMITS: ZipSafetyLimits = {
  maxEntryCount: 500,
  maxSingleEntryBytes: 20 * 1024 * 1024, // 20 MB
  maxTotalUncompressedBytes: 50 * 1024 * 1024, // 50 MB
  maxCompressionRatio: 50 // 50:1
};

export class FileSignatureValidator {
  /**
   * Validates that the buffer matches the expected file signature and package structure.
   */
  public static validate(
    buffer: Buffer,
    extension: string,
    customLimits: ZipSafetyLimits = DEFAULT_ZIP_SAFETY_LIMITS
  ): SignatureValidationResult {
    if (!buffer || buffer.length < 4) {
      return {
        valid: false,
        reason: 'Buffer is empty or too small to contain a valid file header.'
      };
    }

    const ext = extension.toLowerCase().trim().replace(/^\./, '');

    switch (ext) {
      case 'pdf': {
        // PDF files must start with %PDF- within the first 1024 bytes
        const headerSlice = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
        if (!headerSlice.includes('%PDF-')) {
          return {
            valid: false,
            reason: 'Invalid PDF signature: missing %PDF- header.'
          };
        }
        return { valid: true, format: 'pdf' };
      }

      case 'docx': {
        return this.validateOoxmlZipPackage(buffer, 'docx', customLimits);
      }

      case 'xlsx': {
        return this.validateOoxmlZipPackage(buffer, 'xlsx', customLimits);
      }

      case 'jpg':
      case 'jpeg': {
        if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
          return {
            valid: false,
            reason: 'Invalid JPEG signature: missing SOI magic bytes (0xFF 0xD8 0xFF).'
          };
        }
        return { valid: true, format: 'jpeg' };
      }

      case 'png': {
        if (
          buffer[0] !== 0x89 ||
          buffer[1] !== 0x50 || // P
          buffer[2] !== 0x4e || // N
          buffer[3] !== 0x47 || // G
          buffer[4] !== 0x0d ||
          buffer[5] !== 0x0a ||
          buffer[6] !== 0x1a ||
          buffer[7] !== 0x0a
        ) {
          return {
            valid: false,
            reason: 'Invalid PNG signature: missing 8-byte PNG signature header.'
          };
        }
        return { valid: true, format: 'png' };
      }

      case 'webp': {
        if (buffer.length < 12) {
          return { valid: false, reason: 'Invalid WEBP: file too small.' };
        }
        const riff = buffer.subarray(0, 4).toString('latin1');
        const webp = buffer.subarray(8, 12).toString('latin1');
        if (riff !== 'RIFF' || webp !== 'WEBP') {
          return {
            valid: false,
            reason: 'Invalid WEBP signature: missing RIFF/WEBP container header.'
          };
        }
        return { valid: true, format: 'webp' };
      }

      default:
        return {
          valid: false,
          reason: `Unsupported extension for signature verification: .${ext}`
        };
    }
  }

  /**
   * In-memory inspection of ZIP Central Directory and OOXML package structure.
   * Enforces ZIP bomb / resource limits without extracting anything to disk.
   */
  public static validateOoxmlZipPackage(
    buffer: Buffer,
    format: 'docx' | 'xlsx',
    limits: ZipSafetyLimits = DEFAULT_ZIP_SAFETY_LIMITS
  ): SignatureValidationResult {
    // 1. Initial Local File Header Magic: PK\x03\x04
    if (
      buffer[0] !== 0x50 || // P
      buffer[1] !== 0x4b || // K
      buffer[2] !== 0x03 ||
      buffer[3] !== 0x04
    ) {
      return {
        valid: false,
        reason: `Invalid ${format.toUpperCase()} signature: missing ZIP magic bytes (PK\\x03\\x04).`
      };
    }

    // 2. Locate End of Central Directory (EOCD) record
    // EOCD is at least 22 bytes, located within the last 65557 bytes
    let eocdOffset = -1;
    const maxSearch = Math.min(buffer.length, 65557);
    for (let i = buffer.length - 22; i >= buffer.length - maxSearch; i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      return {
        valid: false,
        reason: 'Malformed ZIP archive: End of Central Directory record not found.'
      };
    }

    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const cdSize = buffer.readUInt32LE(eocdOffset + 12);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

    // 3. Central Directory Boundary & Entry Count Protection
    if (cdOffset + cdSize > buffer.length || cdOffset < 0) {
      return {
        valid: false,
        reason: 'Malformed ZIP archive: Central directory offset is out of bounds.'
      };
    }

    if (totalEntries > limits.maxEntryCount) {
      return {
        valid: false,
        reason: `Excessive ZIP entry count (${totalEntries} > ${limits.maxEntryCount}), possible ZIP bomb.`
      };
    }

    // 4. Traverse Central Directory Entries
    const entryNames = new Set<string>();
    let totalUncompressedBytes = 0;
    let currentOffset = cdOffset;

    for (let i = 0; i < totalEntries; i++) {
      if (currentOffset + 46 > buffer.length) {
        return {
          valid: false,
          reason: 'Malformed ZIP archive: Truncated central directory entry.'
        };
      }

      if (buffer.readUInt32LE(currentOffset) !== 0x02014b50) {
        return {
          valid: false,
          reason: 'Malformed ZIP archive: Invalid central directory entry signature.'
        };
      }

      const flags = buffer.readUInt16LE(currentOffset + 8);
      // Bit 0 indicates encryption
      if ((flags & 0x0001) !== 0) {
        return {
          valid: false,
          reason: 'Encrypted or password-protected archives are not supported.'
        };
      }

      const compSize = buffer.readUInt32LE(currentOffset + 20);
      const uncompSize = buffer.readUInt32LE(currentOffset + 24);
      const nameLen = buffer.readUInt16LE(currentOffset + 28);
      const extraLen = buffer.readUInt16LE(currentOffset + 30);
      const commentLen = buffer.readUInt16LE(currentOffset + 32);

      if (currentOffset + 46 + nameLen > buffer.length) {
        return {
          valid: false,
          reason: 'Malformed ZIP archive: Truncated entry name in central directory.'
        };
      }

      const name = buffer.subarray(currentOffset + 46, currentOffset + 46 + nameLen).toString('utf8');

      // Reject path traversal within archive names
      if (name.includes('../') || name.includes('..\\')) {
        return {
          valid: false,
          reason: `Path traversal detected in archive entry name: ${name}`
        };
      }

      // Single entry uncompressed size check
      if (uncompSize > limits.maxSingleEntryBytes) {
        return {
          valid: false,
          reason: `ZIP entry '${name}' uncompressed size (${uncompSize} bytes) exceeds safety limit (${limits.maxSingleEntryBytes} bytes).`
        };
      }

      totalUncompressedBytes += uncompSize;
      if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
        return {
          valid: false,
          reason: `Total uncompressed archive size (${totalUncompressedBytes} bytes) exceeds safety limit (${limits.maxTotalUncompressedBytes} bytes).`
        };
      }

      // Compression ratio check for substantial entries
      if (compSize > 0 && (uncompSize / compSize) > limits.maxCompressionRatio && uncompSize > 1024 * 1024) {
        return {
          valid: false,
          reason: `Suspicious ZIP compression ratio (${Math.round(uncompSize / compSize)}:1) for entry '${name}'.`
        };
      }

      entryNames.add(name);
      currentOffset += 46 + nameLen + extraLen + commentLen;
    }

    // 5. OOXML Package Structure Verification
    // Both DOCX and XLSX MUST contain [Content_Types].xml
    if (!entryNames.has('[Content_Types].xml')) {
      return {
        valid: false,
        reason: `Invalid ${format.toUpperCase()} package: missing [Content_Types].xml.`
      };
    }

    if (format === 'docx') {
      if (!entryNames.has('word/document.xml')) {
        return {
          valid: false,
          reason: 'Invalid DOCX package: missing word/document.xml.'
        };
      }
    } else if (format === 'xlsx') {
      if (!entryNames.has('xl/workbook.xml')) {
        return {
          valid: false,
          reason: 'Invalid XLSX package: missing xl/workbook.xml.'
        };
      }
    }

    return { valid: true, format };
  }
}
