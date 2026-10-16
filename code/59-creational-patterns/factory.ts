export interface ImageProcessor {
  thumbnail(bytes: Uint8Array, width: number): string;
}

class JpegProcessor implements ImageProcessor {
  thumbnail(bytes: Uint8Array, width: number): string {
    return `jpeg thumbnail ${width}px from ${bytes.length} bytes`;
  }
}
class PngProcessor implements ImageProcessor {
  thumbnail(bytes: Uint8Array, width: number): string {
    return `png thumbnail ${width}px from ${bytes.length} bytes, transparency kept`;
  }
}
class HeicProcessor implements ImageProcessor {
  thumbnail(bytes: Uint8Array, width: number): string {
    return `heic converted, then jpeg thumbnail ${width}px from ${bytes.length} bytes`;
  }
}

// Before: every piece of code that needs a thumbnail repeats the choice of class.
export function thumbnailBefore(type: string, bytes: Uint8Array): string {
  let processor: ImageProcessor;
  if (type === "image/jpeg") processor = new JpegProcessor();
  else if (type === "image/png") processor = new PngProcessor();
  else if (type === "image/heic") processor = new HeicProcessor();
  else throw new Error(`cannot process ${type}`);
  return processor.thumbnail(bytes, 200);
}

// After: one function knows which classes exist. Everyone else asks it.
const makers = new Map<string, () => ImageProcessor>([
  ["image/jpeg", () => new JpegProcessor()],
  ["image/png", () => new PngProcessor()],
  ["image/heic", () => new HeicProcessor()],
]);

export function processorFor(type: string): ImageProcessor {
  const make = makers.get(type);
  if (!make) throw new Error(`cannot process ${type}`);
  return make();
}

// A new format is registered from outside. This file is not edited.
export function registerProcessor(type: string, make: () => ImageProcessor): void {
  makers.set(type, make);
}
