export type Suggestion = { readonly text: string; readonly score: number };

// Higher score first; equal scores in alphabetical order, so results never depend on insertion order.
export const better = (a: Suggestion, b: Suggestion) => b.score - a.score || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0);

class TrieNode {
  readonly children = new Map<string, TrieNode>();
  score = 0; // > 0 when a query ends here
  text = "";
  top: Suggestion[] = []; // the best k completions below this node, filled in by build()
}

// A trie: one node per distinct prefix. The path from the root spells the prefix.
export class Trie {
  private readonly root = new TrieNode();
  private readonly k: number;
  nodes = 1;
  constructor(k: number) {
    this.k = k;
  }

  insert(text: string, score: number): void {
    let node = this.root;
    for (const ch of text) {
      let next = node.children.get(ch);
      if (!next) {
        next = new TrieNode();
        node.children.set(ch, next);
        this.nodes += 1;
      }
      node = next;
    }
    node.score += score;
    node.text = text;
  }

  private find(prefix: string): { node: TrieNode | undefined; visited: number } {
    let node: TrieNode | undefined = this.root;
    let visited = 1;
    for (const ch of prefix) {
      node = node.children.get(ch);
      if (!node) break;
      visited += 1;
    }
    return { node, visited };
  }

  // Without precomputed lists: walk every node below the prefix and keep the best k.
  searchSubtree(prefix: string): { results: Suggestion[]; visited: number } {
    const { node, visited } = this.find(prefix);
    if (!node) return { results: [], visited };
    const found: Suggestion[] = [];
    let count = 0;
    const stack = [node];
    while (stack.length > 0) {
      const n = stack.pop() as TrieNode;
      count += 1;
      if (n.score > 0) found.push({ text: n.text, score: n.score });
      for (const c of n.children.values()) stack.push(c);
    }
    return { results: found.sort(better).slice(0, this.k), visited: visited + count - 1 };
  }

  // Store at every node the best k completions below it, children first. The list of a node is
  // the best k of its own query and its children's lists, so each node merges a few short lists.
  build(): void {
    const visit = (n: TrieNode): Suggestion[] => {
      const all: Suggestion[] = n.score > 0 ? [{ text: n.text, score: n.score }] : [];
      for (const c of n.children.values()) all.push(...visit(c));
      n.top = all.sort(better).slice(0, this.k);
      return n.top;
    };
    visit(this.root);
  }

  // With precomputed lists: walk down the prefix, read the list. Cost: the length of the prefix.
  complete(prefix: string): { results: Suggestion[]; visited: number } {
    const { node, visited } = this.find(prefix);
    return { results: node ? node.top : [], visited };
  }

  // Counts for estimating memory: nodes, list entries stored, and nodes left if chains of
  // single-child nodes are merged into one (a radix tree).
  stats(): { nodes: number; entries: number; radixNodes: number } {
    let entries = 0;
    let radixNodes = 0;
    const stack = [this.root];
    while (stack.length > 0) {
      const n = stack.pop() as TrieNode;
      entries += n.top.length;
      if (n.children.size !== 1 || n.score > 0) radixNodes += 1;
      for (const c of n.children.values()) stack.push(c);
    }
    return { nodes: this.nodes, entries, radixNodes };
  }
}
