// Questions users ask a photo app's help assistant: each intent (one right answer) in four phrasings.
// Several intents are near each other on purpose: deleting a photo, deleting an album, restoring a photo.
export const INTENTS: { intent: string; phrasings: string[] }[] = [
  { intent: "delete-photo", phrasings: ["How do I delete a photo?", "How can I remove a picture?", "Delete a photo from my library", "How do I erase photos?"] },
  { intent: "delete-album", phrasings: ["How do I delete an album?", "How can I remove an album?", "Delete an album but keep the photos", "Remove an album"] },
  { intent: "restore-photo", phrasings: ["How do I restore a deleted photo?", "Can I get back a photo I deleted?", "Recover a deleted picture", "Restore photos from the trash"] },
  { intent: "share-album", phrasings: ["How do I share an album?", "How can I send an album to a friend?", "Share an album with my family", "Send my album to someone"] },
  { intent: "stop-sharing", phrasings: ["How do I stop sharing an album?", "How can I unshare an album?", "Remove someone from a shared album", "Stop sharing my photos"] },
  { intent: "storage-full", phrasings: ["My storage is full, what can I do?", "How do I free up storage?", "Out of storage space", "Storage full warning"] },
  { intent: "upgrade-plan", phrasings: ["How do I upgrade my storage plan?", "How can I buy more storage?", "Get a bigger storage plan", "Upgrade my plan"] },
  { intent: "cancel-plan", phrasings: ["How do I cancel my storage plan?", "How can I stop my subscription?", "Cancel my subscription", "End my plan"] },
  { intent: "sync-broken", phrasings: ["Photos are not syncing to my phone", "Why won't my photos sync?", "Sync stopped working", "My phone does not sync photos"] },
  { intent: "download-original", phrasings: ["How do I download the original photo?", "Can I download full resolution photos?", "Download originals of my pictures", "Get the original file of a photo"] },
  { intent: "download-album", phrasings: ["How do I download a whole album?", "Can I download all photos in an album?", "Download an album as a zip", "Save an album to my computer"] },
  { intent: "share-link-expire", phrasings: ["Do share links expire?", "How long does a share link last?", "My share link stopped working", "Make a share link expire"] },
  { intent: "edit-crop", phrasings: ["How do I crop a photo?", "How can I cut the edges of a picture?", "Crop a picture", "Change the shape of a photo"] },
  { intent: "edit-undo", phrasings: ["How do I undo an edit?", "Can I get back the original after editing?", "Revert a photo to the original", "Undo changes to a picture"] },
  { intent: "find-people", phrasings: ["How do I find photos of a person?", "Search for pictures of my mother", "Find photos of someone", "Group photos by people"] },
  { intent: "find-place", phrasings: ["How do I find photos from a place?", "Search pictures by location", "Find photos taken in Lisbon", "Show photos on a map"] },
];
