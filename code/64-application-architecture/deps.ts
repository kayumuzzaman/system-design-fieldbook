// Checks the dependency rule by reading the import statements of every file in this folder.
import { readdirSync, readFileSync } from "node:fs";

export type Layer = "domain" | "application" | "adapters" | "root";
export interface Edge {
  from: string;
  to: string;
}

// What each layer is allowed to import. Dependencies point inward: adapters -> application -> domain.
const allowed: Record<Layer, Layer[]> = {
  domain: ["domain"],
  application: ["application", "domain"],
  adapters: ["adapters", "application", "domain"],
  root: ["root", "adapters", "application", "domain"],
};

export const layerOf = (file: string): Layer => (file.includes("/") ? (file.split("/")[0] as Layer) : "root");

export function importsIn(root: URL): Edge[] {
  const edges: Edge[] = [];
  const files = [
    ...(["domain", "application", "adapters"] as const).flatMap((dir) => readdirSync(new URL(`${dir}/`, root)).map((name) => `${dir}/${name}`)),
    "main.ts",
  ];
  for (const from of files) {
    const text = readFileSync(new URL(from, root), "utf8");
    for (const match of text.matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
      const to = new URL(match[1] as string, new URL(from, root)).href.slice(root.href.length);
      edges.push({ from, to });
    }
  }
  return edges;
}

export const violations = (edges: Edge[]): Edge[] => edges.filter((edge) => !allowed[layerOf(edge.from)].includes(layerOf(edge.to)));
