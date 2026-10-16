// Before: plain records, and a caller that walks through three of them.
type PlanData = { maxPhotoBytes: number };
type OwnerData = { active: boolean; plan: PlanData };
type AlbumData = { owner: OwnerData; photoCount: number };

export function canUploadBefore(album: AlbumData, bytes: number): boolean {
  return album.owner.active && album.owner.plan.maxPhotoBytes >= bytes && album.photoCount < 1000;
}

// After: each object answers a question about itself, and asks its neighbor about the rest.
export class Plan {
  private readonly maxPhotoBytes: number;
  constructor(maxPhotoBytes: number) {
    this.maxPhotoBytes = maxPhotoBytes;
  }
  allows(bytes: number): boolean {
    return bytes <= this.maxPhotoBytes;
  }
}

export class Owner {
  private readonly active: boolean;
  private readonly plan: Plan;
  constructor(active: boolean, plan: Plan) {
    this.active = active;
    this.plan = plan;
  }
  canStore(bytes: number): boolean {
    return this.active && this.plan.allows(bytes);
  }
}

export class Album {
  private readonly owner: Owner;
  private photoCount = 0;
  constructor(owner: Owner) {
    this.owner = owner;
  }
  canAccept(bytes: number): boolean {
    return this.photoCount < 1000 && this.owner.canStore(bytes);
  }
}
