export class ImagePreprocessor {
  private static async loadImageElement(imageInput: any): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);

      if (typeof imageInput === 'string') {
        img.src = imageInput;
      } else if (imageInput instanceof Blob || imageInput instanceof File) {
        img.src = URL.createObjectURL(imageInput);
      } else if (imageInput && imageInput.dataUrl) {
        img.src = imageInput.dataUrl;
      } else {
        reject(new Error('Unsupported image input for browser canvas preprocessing'));
      }
    });
  }

  // Variant B: Grayscale + Linear Contrast Boost + 1.5x Upscale
  static async processVariantB(imageInput: any): Promise<any> {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const img = await this.loadImageElement(imageInput);
        const scale = img.width < 1200 ? 1.5 : 1.0;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return imageInput;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        const contrastFactor = 1.4;

        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const contrastGray = Math.min(255, Math.max(0, (gray - 128) * contrastFactor + 128));
          d[i] = contrastGray;
          d[i + 1] = contrastGray;
          d[i + 2] = contrastGray;
        }
        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/png');
      } catch {
        return imageInput;
      }
    } else {
      // Node.js environment fallback for CLI tests
      try {
        const req = eval('require');
        const sharp = req('sharp');
        const fs = req('fs');
        let inputBuf: Buffer;
        if (typeof imageInput === 'string') {
          if (!fs.existsSync(imageInput)) return imageInput;
          inputBuf = fs.readFileSync(imageInput);
        } else if (Buffer.isBuffer(imageInput)) {
          inputBuf = imageInput;
        } else if (imageInput && imageInput.buffer) {
          inputBuf = imageInput.buffer;
        } else {
          return imageInput;
        }

        return await sharp(inputBuf)
          .resize({ width: 1600, fit: 'inside', withoutEnlargement: false })
          .grayscale()
          .linear(1.4, -35)
          .png()
          .toBuffer();
      } catch {
        return imageInput;
      }
    }
  }

  // Variant C: Grayscale + Threshold Binarization
  static async processVariantC(imageInput: any): Promise<any> {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const img = await this.loadImageElement(imageInput);
        const scale = img.width < 1200 ? 1.5 : 1.0;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return imageInput;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        let total = 0;
        const grays = new Uint8Array(d.length / 4);
        for (let i = 0, j = 0; i < d.length; i += 4, j++) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          grays[j] = gray;
          total += gray;
        }
        const avgThreshold = total / grays.length;

        for (let i = 0, j = 0; i < d.length; i += 4, j++) {
          const binary = grays[j] > avgThreshold ? 255 : 0;
          d[i] = binary;
          d[i + 1] = binary;
          d[i + 2] = binary;
        }
        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/png');
      } catch {
        return imageInput;
      }
    } else {
      try {
        const req = eval('require');
        const sharp = req('sharp');
        const fs = req('fs');
        let inputBuf: Buffer;
        if (typeof imageInput === 'string') {
          if (!fs.existsSync(imageInput)) return imageInput;
          inputBuf = fs.readFileSync(imageInput);
        } else if (Buffer.isBuffer(imageInput)) {
          inputBuf = imageInput;
        } else if (imageInput && imageInput.buffer) {
          inputBuf = imageInput.buffer;
        } else {
          return imageInput;
        }

        return await sharp(inputBuf)
          .resize({ width: 1600, fit: 'inside', withoutEnlargement: false })
          .grayscale()
          .threshold(128)
          .png()
          .toBuffer();
      } catch {
        return imageInput;
      }
    }
  }
}
