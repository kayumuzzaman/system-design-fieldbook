import { Rng } from './rng.ts';

// How many bytes delivered mail takes, stored as a full copy per recipient, or with each distinct
// attachment stored once, found by the hash of its content. Bodies stay one per recipient: bulk mail
// is usually personalized (a name, tracking links), so its copies are not identical.
export type MailMix = {
  readonly messages: number;
  readonly headerBytes: number;        // per recipient: envelope, Received lines, flags, labels
  readonly personal: { readonly bodyMedian: number; readonly attachmentShare: number; readonly attachmentMedian: number; readonly resendShare: number };
  readonly bulkShare: number;          // newsletters and notifications sent to many of our users at once
  readonly bulk: { readonly bodyMedian: number; readonly recipientsMedian: number; readonly recipientsMax: number };
  readonly seed: number;
};

export const MIX: MailMix = {
  messages: 200_000, headerBytes: 2_000,
  personal: { bodyMedian: 8_000, attachmentShare: 0.15, attachmentMedian: 300_000, resendShare: 0.1 },
  bulkShare: 0.01, bulk: { bodyMedian: 60_000, recipientsMedian: 50, recipientsMax: 100_000 },
  seed: 841,
};

export type StorageResult = {
  readonly deliveries: number;          // message copies placed in mailboxes
  readonly perRecipient: number;        // bytes with a full copy in every mailbox
  readonly singleInstance: number;      // bytes with each distinct attachment stored once
  readonly attachmentShare: number;     // share of the full-copy bytes that are attachments
  readonly bulkShareOfDeliveries: number;
  readonly bulkShareOfCopyBytes: number;
};

const lognormal = (rng: Rng, median: number, sigma: number) => median * Math.exp(sigma * rng.normal());

export function storage(mix: MailMix): StorageResult {
  const rng = new Rng(mix.seed);
  const attachments: number[] = [];                  // sizes of distinct attachments seen so far
  let deliveries = 0, perRecipient = 0, single = 0, bulkDeliveries = 0, bulkBytes = 0, attachmentBytes = 0;
  for (let i = 0; i < mix.messages; i++) {
    const bulk = rng.next() < mix.bulkShare;
    let recipients: number, body: number, attachment = 0, newAttachment = 0;
    if (bulk) {
      recipients = Math.min(mix.bulk.recipientsMax, Math.max(2, Math.round(lognormal(rng, mix.bulk.recipientsMedian, 1.5))));
      body = lognormal(rng, mix.bulk.bodyMedian, 0.5);
    } else {
      const r = rng.next();
      recipients = r < 0.85 ? 1 : 2 + rng.below(9);                   // most personal mail has one recipient here
      body = lognormal(rng, mix.personal.bodyMedian, 1);
      if (rng.next() < mix.personal.attachmentShare) {
        if (attachments.length && rng.next() < mix.personal.resendShare) attachment = attachments[rng.below(attachments.length)] as number;  // the same file again
        else { attachment = lognormal(rng, mix.personal.attachmentMedian, 1.2); newAttachment = attachment; attachments.push(attachment); }
      }
    }
    const copy = body + attachment;
    deliveries += recipients;
    perRecipient += recipients * (mix.headerBytes + copy);
    single += recipients * (mix.headerBytes + body) + newAttachment;  // a body per mailbox, a new file once
    attachmentBytes += recipients * attachment;
    if (bulk) { bulkDeliveries += recipients; bulkBytes += recipients * (mix.headerBytes + copy); }
  }
  return { deliveries, perRecipient, singleInstance: single, attachmentShare: attachmentBytes / perRecipient, bulkShareOfDeliveries: bulkDeliveries / deliveries, bulkShareOfCopyBytes: bulkBytes / perRecipient };
}
