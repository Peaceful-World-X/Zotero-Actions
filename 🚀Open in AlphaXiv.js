/**
 * Open in AlphaXiv.
 * @author Peaceful-World-X
 * @usage You can assign a custom shortcut key, for example: x
 * @link https://github.com/windingwind/zotero-actions-tags/discussions/587
 */
function extractArXivId(text) {
  if (!text) return null;

  // 新格式，例如 2603.03596 或 2603.03596v1
  let m = text.match(/\b(\d{4}\.\d{4,5})(v\d+)?\b/i);
  if (m) return m[1];

  // 老格式，例如 cs/0112017
  m = text.match(/\b([a-z\-]+\/\d{7})(v\d+)?\b/i);
  if (m) return m[1];

  return null;
}

let arxivId = item.getField("arXiv");

if (arxivId) {
  arxivId = arxivId.trim().replace(/v\d+$/i, "");
} else {
  const extra = item.getField("extra") || "";
  const urlField = item.getField("url") || "";

  arxivId = extractArXivId(extra) || extractArXivId(urlField);
}

const url = arxivId
  ? `https://www.alphaxiv.org/abs/${arxivId}`
  : "https://www.alphaxiv.org/bookmarks";

Zotero.launchURL(url);