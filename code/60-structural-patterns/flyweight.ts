export type Camera = Readonly<{ make: string; model: string; lens: string; sensor: string }>;

const cameras = new Map<string, Camera>();

// Returns the one shared object for this camera, creating it the first time it is asked for.
export function cameraFor(make: string, model: string, lens: string, sensor: string): Camera {
  const key = `${make}|${model}|${lens}|${sensor}`;
  let camera = cameras.get(key);
  if (!camera) {
    camera = Object.freeze({ make, model, lens, sensor }); // frozen: it is shared, so nobody may change it
    cameras.set(key, camera);
  }
  return camera;
}

export function distinctCameras(): number {
  return cameras.size;
}
