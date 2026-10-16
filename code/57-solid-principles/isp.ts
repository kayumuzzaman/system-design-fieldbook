type Image = { width: number; height: number };

// Before: one interface for everything the media library can do.
export interface MediaTools {
  resize(image: Image, width: number): Image;
  detectFaces(image: Image): number;
  readText(image: Image): string;
  transcodeVideo(path: string, format: string): string;
}

export function thumbnailBefore(tools: MediaTools, image: Image): Image {
  return tools.resize(image, 200); // uses one method of four
}

// After: one interface for each thing a caller might need.
export interface Resizer {
  resize(image: Image, width: number): Image;
}
export interface FaceDetector {
  detectFaces(image: Image): number;
}

export function thumbnail(resizer: Resizer, image: Image): Image {
  return resizer.resize(image, 200);
}

// One class can still do several jobs. Each caller sees only the part it asked for.
export class ImageTools implements Resizer, FaceDetector {
  resize(image: Image, width: number): Image {
    return { width, height: Math.round((image.height * width) / image.width) };
  }
  detectFaces(): number {
    return 0;
  }
}
