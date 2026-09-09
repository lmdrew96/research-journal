/**
 * Turns ASCII arrows into real arrow glyphs in rendered markdown.
 *
 * `->` becomes →, `<-` becomes ←, `<->` becomes ↔. Extra dashes are absorbed,
 * so `-->` and `<-->` read the same as their short forms — notes get typed
 * both ways and nobody should have to remember which one renders.
 *
 * Written as a local remark plugin rather than pulling in remark-textr or
 * smartypants: this is three substitutions, and those packages also rewrite
 * quotes and dashes, which would change how existing notes render.
 */

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
}

/**
 * Order matters — the two-sided form has to match before `<-` claims its
 * opening half and leaves a stray `>` behind.
 */
const ARROWS: ReadonlyArray<readonly [RegExp, string]> = [
  [/<-+>/g, '↔'],
  [/-+>/g, '→'],
  [/<-+/g, '←'],
];

/**
 * `code` and `inlineCode` also keep their content in `value`, and a shell
 * pipeline or a type signature must survive verbatim — so they are skipped
 * rather than walked. Everything else that holds prose (headings, list items,
 * table cells, emphasis, blockquotes) bottoms out in `text` nodes and is
 * reached through `children`.
 */
function substitute(node: MdastNode): void {
  if (node.type === 'code' || node.type === 'inlineCode') return;

  if (node.type === 'text' && typeof node.value === 'string') {
    node.value = ARROWS.reduce((text, [pattern, glyph]) => text.replace(pattern, glyph), node.value);
    return;
  }

  node.children?.forEach(substitute);
}

export const remarkArrows = () => (tree: MdastNode) => {
  substitute(tree);
};
