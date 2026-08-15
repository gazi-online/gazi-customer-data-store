import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function verifyImages() {
  const dir = process.cwd();
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    if (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png')) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      const ext = path.extname(file).toLowerCase();
      let mime = 'image/jpeg';
      if (ext === '.png') mime = 'image/png';
      
      try {
        const metadata = await sharp(filePath).metadata();
        console.log(`[Image Found]`);
        console.log(`Name: ${file}`);
        console.log(`Size: ${stat.size} bytes`);
        console.log(`MIME: ${mime}`);
        console.log(`Resolution: ${metadata.width}x${metadata.height}`);
        console.log(`------------------------`);
      } catch (e: any) {
        console.log(`Error reading ${file}: ${e.message}`);
      }
    }
  }
}

verifyImages();
