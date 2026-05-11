/**
 * Open in CoolPapers.
 * Use arXiv ID when available; otherwise search by title.
 *
 * @author Peaceful-World-X
 * @usage You can assign a custom shortcut key, for example: x
 * @link https://papers.cool/
 */

function extractArXivId(text) {
  if (!text) return null;

  let m = text.match(/\b(\d{4}\.\d{4,5})(?:v\d+)?\b/i);
  if (m) return m[1];

  m = text.match(/\b([a-z\-]+\/\d{7})(?:v\d+)?\b/i);
  if (m) return m[1];

  return null;
}

function getFieldText(item, fieldName) {
  try {
    return (item.getField(fieldName) || "").trim();
  } catch (error) {
    return "";
  }
}

function getTargetItem(item) {
  try {
    if (item.isRegularItem && item.isRegularItem()) return item;
    if (item.parentItem) return item.parentItem;
  } catch (error) {}
  return item;
}

const targetItem = getTargetItem(item);

const arxivId =
  extractArXivId(getFieldText(targetItem, "arXiv")) ||
  extractArXivId(getFieldText(targetItem, "extra")) ||
  extractArXivId(getFieldText(targetItem, "url"));

if (arxivId) {
  Zotero.launchURL(`https://papers.cool/arxiv/${arxivId}`);
  return;
}

const title = getFieldText(targetItem, "title");
if (title) {
  Zotero.launchURL(
    `https://papers.cool/venue/search?highlight=1&query=${encodeURIComponent(title)}`
  );
}