// A small help center for the photo app: twelve articles, and questions whose answers are known.
// Each question names a short passage that a retrieved chunk must contain for the retrieval to count as found.
export interface Article { id: string; title: string; body: string; audience?: "everyone" | "staff" }
export interface Question { text: string; answer: string }

export const ARTICLES: Article[] = [
  { id: "trash", title: "Deleting photos and the trash", body: `When you delete a photo or video, it moves to the trash. Items stay in the trash for 30 days, and then they are removed for good. While an item is in the trash it still counts toward your storage.

To restore an item, open the trash, select it and tap Restore. It returns to your library and to every album it was in. You can restore items on any of your devices, because the trash is synced.

To free space at once, open the trash and tap Empty trash. Emptied items cannot be recovered by you or by our support team.

Deleting a photo on one device deletes it everywhere. If you only want to free space on a phone, use Free up space in settings instead: it removes the local copies of photos that are safely backed up.` },
  { id: "albums", title: "Creating and managing albums", body: `An album is a collection of photos from your library. A photo can be in many albums at once, and adding it to an album does not make a copy, so albums use no extra storage.

To create an album, select photos and tap Add to album, then New album. To rename an album, open it and tap its name.

When you delete an album, the photos stay in your library. Only the album itself is removed. To delete the photos too, select them inside the album and delete them before you delete the album.

Albums can be sorted by date, by title or by the date you last added a photo. Pinned albums appear first on the Albums page.` },
  { id: "sharing", title: "Sharing albums with other people", body: `You can share an album by link or by inviting people by email. People with the link can view the album without an account. Invited people can also add their own photos if you allow contributions.

A share link can expire after 7 days, after 30 days, or never. You choose when you create the link, and you can change it later in the album's sharing settings. After a link expires, people who open it see a message that the album is no longer shared.

To stop sharing an album, open its sharing settings and tap Stop sharing. Everyone loses access at once, including invited people. Photos they added stay in the album.

Shared albums remove location information from photos by default. You can include locations in the sharing settings.` },
  { id: "plans", title: "Storage plans", body: `Every account includes 15 GB of storage for free. The Plus plan gives 200 GB and the Pro plan gives 2 TB. Storage is shared by photos, videos and items in the trash.

You can upgrade at any time from Settings, then Storage. The new space is available immediately, and you pay the difference for the rest of the billing period.

If you go over your storage limit, new uploads pause until you free space or upgrade. Nothing is deleted. Photos already backed up stay available on all your devices.

Family sharing lets up to five people share one Plus or Pro plan. Each person keeps a private library.` },
  { id: "cancel", title: "Canceling a subscription", body: `You can cancel a Plus or Pro subscription at any time in Settings, then Storage, then Manage plan. Your plan stays active until the end of the current billing period, and then your account returns to the free 15 GB.

If you are using more than 15 GB when the plan ends, your photos are not deleted. Your library becomes read-only for 90 days: you can view and download everything, but you cannot upload. After 90 days, uploads stay paused until you are under the limit.

Refunds are given only within 14 days of the first payment of a yearly plan.` },
  { id: "sync", title: "Backup and sync problems", body: `Photos back up automatically when the app is open or running in the background. By default, backup uses Wi-Fi only. To back up over mobile data, turn on Use mobile data in backup settings.

Backup pauses when your phone is in battery saver mode or below 20% charge. It resumes when you charge the phone.

Error E-403 means the app is signed out of your account, usually after a password change. Sign out and sign in again to resume backup. Error E-507 means your storage is full; see Storage plans.

If photos appear on your phone but not on the web, check that backup is turned on for that folder. Screenshots and downloads folders are not backed up unless you choose them.` },
  { id: "download", title: "Downloading photos and albums", body: `You can download any photo in its original quality, exactly as it was uploaded, or in high quality, which is smaller. Original quality keeps the full resolution and all the information in the file.

To download a whole album, open it and choose Download all. The album is packed into a zip file of up to 500 photos; larger albums are split into several files.

Photos taken on some phones are stored in the HEIC format. When you download them, you can keep HEIC or convert them to JPEG, which more programs can open. Converting does not change the photo in your library.` },
  { id: "editing", title: "Editing photos", body: `You can crop, rotate and straighten a photo, adjust light and color, and apply filters. To crop, open the photo, tap Edit, then Crop, and drag the corners.

Edits never overwrite the original. To undo every change, open the photo, tap Edit and choose Revert to original. You can revert at any time, even years later.

Edited photos are saved as the same photo, not a copy. If you want to keep both versions, use Duplicate before you edit.` },
  { id: "search", title: "Searching your photos", body: `Search finds photos by the people, places and things in them, and by text that appears in the photo, such as a sign or a receipt.

To find photos of a person, turn on face grouping in settings. The app groups similar faces, and you can name each group. Face grouping is off by default and the face data never leaves your account.

To find photos from a place, search for the city or country. Places come from the location recorded by your camera. Photos without a location can be given one by hand in their details.` },
  { id: "privacy", title: "Privacy and security", body: `Turn on two-step verification to protect your account. You can use an authenticator app or a security key.

The Hidden album keeps photos out of your library, search and memories. It is locked with your device passcode or face unlock, and its photos are not included in shared albums.

You can remove the location from a photo before you share it, or remove locations from all shared albums in the sharing settings.` },
  { id: "prints", title: "Ordering prints", body: `You can order prints, photo books and canvases from any album. Orders are printed by our partner and usually arrive in 3 to 5 business days.

You can cancel a print order within one hour of placing it, from Orders in the menu. After an hour the order is in production and cannot be changed.

If a print arrives damaged, report it within 30 days and we will reprint it at no charge.` },
  { id: "account", title: "Your account", body: `To change the email address of your account, go to Settings, then Account. We send a confirmation to the new address.

You can export all your photos and their information as an archive. The archive is usually ready within 48 hours, and we email you a link that works for 7 days.

When you delete your account, you have 30 days to change your mind. After 30 days your photos and account data are deleted permanently.` },
  { id: "staff-refunds", title: "Internal: approving refunds outside policy", audience: "staff", body: `Support agents may approve a refund outside the 14-day window for accounts charged twice. Check the payments console for the duplicate charge before approving. Never approve more than one refund per account per year without a manager.` },
];

export const QUESTIONS: Question[] = [
  { text: "How long do deleted pictures stay in the bin?", answer: "stay in the trash for 30 days" },
  { text: "Can I get back a photo I deleted?", answer: "To restore an item, open the trash" },
  { text: "Does stuff in the trash use my storage?", answer: "it still counts toward your storage" },
  { text: "Can support recover photos after I empty the trash?", answer: "cannot be recovered by you or by our support team" },
  { text: "How do I free space on my phone without deleting photos?", answer: "removes the local copies of photos that are safely backed up" },
  { text: "Do albums take up extra space?", answer: "albums use no extra storage" },
  { text: "If I delete an album, are the photos deleted too?", answer: "When you delete an album, the photos stay in your library" },
  { text: "Can people see a shared album without an account?", answer: "view the album without an account" },
  { text: "When does a share link expire?", answer: "A share link can expire after 7 days, after 30 days, or never" },
  { text: "How do I unshare an album?", answer: "open its sharing settings and tap Stop sharing" },
  { text: "Are locations included when I share an album?", answer: "Shared albums remove location information from photos by default" },
  { text: "How much free storage do I get?", answer: "Every account includes 15 GB of storage for free" },
  { text: "How big is the Pro plan?", answer: "the Pro plan gives 2 TB" },
  { text: "What happens if my storage is full?", answer: "new uploads pause until you free space or upgrade" },
  { text: "Can my family use my plan?", answer: "Family sharing lets up to five people share one Plus or Pro plan" },
  { text: "What happens to my photos if I cancel my subscription and have more than 15 GB?", answer: "Your library becomes read-only for 90 days" },
  { text: "Can I get my money back?", answer: "Refunds are given only within 14 days of the first payment of a yearly plan" },
  { text: "Why does backup only work on Wi-Fi?", answer: "By default, backup uses Wi-Fi only" },
  { text: "Backup stopped when my battery was low", answer: "Backup pauses when your phone is in battery saver mode or below 20% charge" },
  { text: "What does error E-403 mean?", answer: "Error E-403 means the app is signed out of your account" },
  { text: "I see E-507 on my phone", answer: "Error E-507 means your storage is full" },
  { text: "My screenshots are not on the website", answer: "Screenshots and downloads folders are not backed up unless you choose them" },
  { text: "How many photos fit in one zip when I download an album?", answer: "a zip file of up to 500 photos" },
  { text: "Can I convert HEIC to JPEG?", answer: "you can keep HEIC or convert them to JPEG" },
  { text: "How do I undo my edits?", answer: "tap Edit and choose Revert to original" },
  { text: "How do I find pictures of my mother?", answer: "turn on face grouping in settings" },
  { text: "How do I hide photos from my library?", answer: "The Hidden album keeps photos out of your library" },
  { text: "How long until my prints arrive?", answer: "usually arrive in 3 to 5 business days" },
  { text: "Can I cancel a print order?", answer: "cancel a print order within one hour of placing it" },
  { text: "How long does it take to export all my data?", answer: "The archive is usually ready within 48 hours" },
];
