/**
 * One mark, never redrawn per surface — the same disc, ring and serif lettering the tourist app
 * uses, with VENDOR where a guest sees their island. Drawn in type rather than shipped as an
 * image, so it stays crisp at any size and costs nothing in the bundle.
 */
export function Crest() {
  return (
    <span className="crest" aria-hidden="true">
      <span className="crest__vip">VIP</span>
      <span className="crest__role">VENDOR</span>
    </span>
  );
}
