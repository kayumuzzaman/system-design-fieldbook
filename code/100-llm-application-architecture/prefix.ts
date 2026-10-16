import { hash32 } from "./random.ts";

// Prefix caching, as inference servers do it. The prompt is cut into blocks of 16 tokens, and each block is
// named by a hash of everything from the start of the prompt to the end of that block. Two prompts share a
// cached block only if they agree on every token before it, so a single changed token early in the prompt
// makes every later block a miss.
export class PrefixCache {
  private readonly blocks = new Map<number, true>(); // block name; Map order gives least recently used first
  private readonly blockTokens: number;
  private readonly capacity: number;
  reused = 0;
  computed = 0;
  constructor(capacityBlocks: number, blockTokens = 16) {
    this.capacity = capacityBlocks;
    this.blockTokens = blockTokens;
  }
  // Processes one prompt. Returns how many of its tokens were found in the cache and did not need prefill.
  prefill(tokens: readonly string[]): number {
    let name = 0, matched = 0, stillMatching = true;
    const whole = Math.floor(tokens.length / this.blockTokens);
    for (let b = 0; b < whole; b += 1) {
      name = hash32(name + "|" + tokens.slice(b * this.blockTokens, (b + 1) * this.blockTokens).join(""));
      if (stillMatching && this.blocks.has(name)) matched += this.blockTokens;
      else stillMatching = false;
      this.blocks.delete(name); // store or refresh it as the most recently used
      this.blocks.set(name, true);
      if (this.blocks.size > this.capacity) this.blocks.delete(this.blocks.keys().next().value as number);
    }
    this.reused += matched;
    this.computed += tokens.length - matched;
    return matched;
  }
  get reusedShare(): number { return this.reused / (this.reused + this.computed); }
}
