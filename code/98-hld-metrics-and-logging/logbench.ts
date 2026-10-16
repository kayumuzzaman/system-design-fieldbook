// Timings for finding one trace id, recorded once: `node logbench.ts > logbench.json`. They differ between runs and machines.
import { seeded } from "./rng.ts";
import { chunked, fullIndexBytes, logLines, scan } from "./logs.ts";

const lines = logLines(seeded(11), 200_000);
const store = chunked(lines);
const full = fullIndexBytes(lines);
const target = lines[123_456] as (typeof lines)[number];
const id = (JSON.parse(target.text) as { trace_id: string }).trace_id;
const ms = (f: () => unknown) => { const t = process.hrtime.bigint(); f(); return Number(process.hrtime.bigint() - t) / 1e6; };
scan(store, target.service, id);   // warm up
const oneService = ms(() => scan(store, target.service, id));
const everything = ms(() => { for (const s of new Set(store.chunks.map((c) => c.stream.split("/")[0] as string))) scan(store, s, id); });
const viaIndex = ms(() => full.postings.get(id));
console.log(JSON.stringify({ node: process.version, oneServiceMs: Math.round(oneService * 10) / 10, allServicesMs: Math.round(everything * 10) / 10, indexLookupMs: Math.round(viaIndex * 1000) / 1000, bytesOneService: scan(store, target.service, id).bytesRead, rawBytes: store.rawBytes }));
