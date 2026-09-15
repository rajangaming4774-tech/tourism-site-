/* Wikipedia photo lookup, shared by the destination page and the on-site guide.
 *
 * Consolidates two near-duplicate implementations that had drifted apart:
 * js/place.js had the memoised two-Map cache but no disambiguation guard and
 * no credit; js/app.js had both of those but cached rendered HTML, which locks
 * the markup to one caller.
 *
 * This caches the DATA and lets each caller build its own node — the grid wants
 * a bare <img> in a 4:3 frame, the guide wants a <figure> with a credit line
 * and an onerror handler, and a cached HTML string can give you neither.
 *
 * CSP: vercel.json already allows en.wikipedia.org in connect-src and
 * upload.wikimedia.org in img-src. Nothing to change.
 */
window.WikiPhoto = (function () {
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Memoises the in-flight PROMISE, not the value: the same title appears in
  // both the grid and the flythrough, so this collapses duplicate requests.
  // A resolved null is cached too, so a dead title is never re-requested.
  const summaries = new Map();

  function summary(title) {
    if (!title) return Promise.resolve(null);
    if (!summaries.has(title)) {
      // navigator.onLine === false is reliable; true is not. Use it only to
      // skip a doomed request, never to assume connectivity.
      if (navigator.onLine === false) return Promise.resolve(null);
      summaries.set(
        title,
        fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      );
    }
    return summaries.get(title);
  }

  /* Resolves the first title that yields a usable photo.
   * opts.size: "thumb" (default) | "original". The guide must use "thumb" —
   * originalimage can be a multi-megabyte JPEG, and that page's whole premise
   * is a visitor on mobile data standing at the site. */
  async function lookup(titles, opts) {
    const list = (Array.isArray(titles) ? titles : [titles]).filter(Boolean);
    const size = (opts && opts.size) || "thumb";
    for (const title of list) {
      const d = await summary(title);
      // type must be "standard": a disambiguation page still returns 200 with
      // a thumbnail, and it would be the wrong picture.
      if (!d || d.type !== "standard" || !d.thumbnail || !d.thumbnail.source) continue;
      const useOriginal = size === "original" && d.originalimage && d.originalimage.width <= 2200;
      const img = useOriginal ? d.originalimage : d.thumbnail;
      return {
        src: img.source,
        width: img.width,
        height: img.height,
        title: d.title || title,
        pageUrl: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || null,
        file: decodeURIComponent(String(d.thumbnail.source).split("/").pop().replace(/^\d+px-/, "")),
      };
    }
    return null;
  }

  /* Injects a <figure> into `target`, or removes `target` entirely if no photo
   * can be shown. Resolves true/false.
   *
   * `credit` is the authored { author, licence, licenceUrl, file } from the
   * content file, applied ONLY when its filename still matches what the API
   * returned — so a changed lead image upstream falls back to the generic
   * link rather than crediting the wrong photographer.
   */
  async function render(target, titles, opts) {
    if (!target) return false;
    const o = opts || {};
    const got = await lookup(titles, o);
    // Re-check after the await: setSheet() replaces the sheet body wholesale,
    // so opening card A then card B leaves A's node detached. This alone
    // handles the race — no request token needed.
    if (!target.isConnected) return false;
    if (!got) {
      target.remove();
      return false;
    }

    const credit = o.credit && o.credit.file === got.file ? o.credit : null;
    const creditHtml = credit
      ? `Photo: ${esc(credit.author)}` +
        (credit.licenceUrl
          ? ` · <a href="${esc(credit.licenceUrl)}" target="_blank" rel="noopener">${esc(credit.licence)}</a>`
          : ` · ${esc(credit.licence)}`)
      : `Image · <a href="${esc(got.pageUrl || "https://en.wikipedia.org/")}" target="_blank" rel="noopener">Wikipedia</a>`;

    target.innerHTML =
      `<span class="g-photo-frame"><img alt="${esc(o.alt || got.title)}" decoding="async" /></span>` +
      `<figcaption>${creditHtml}</figcaption>`;

    const img = target.querySelector("img");
    // No loading="lazy" here by default: the guide's sheet is a transformed,
    // overflow-hidden container, where lazy loading can defer indefinitely.
    if (o.lazy) img.loading = "lazy";
    // A 200 from the API can still be followed by a failed load from
    // upload.wikimedia.org — captive portal, blocked host, partial cache.
    img.addEventListener("error", () => target.remove(), { once: true });
    img.src = got.src;
    return true;
  }

  return { summary, lookup, render };
})();
