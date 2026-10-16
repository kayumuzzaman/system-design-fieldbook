// Prints the data behind the chapter's figures as JSON: `node figures.ts > figures.json`
import { boundary, worstSpans } from "./compare.ts";
console.log(JSON.stringify({ boundary: boundary(), worst: worstSpans() }));
