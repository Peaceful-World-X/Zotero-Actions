/**
 * 🎓 Get hjfy CN_PDF
 *
 * Automatically fetches the hjfy Chinese-translated PDF for selected arXiv
 * items in Zotero, imports it as an attachment, and sets it as the preferred
 * PDF to open by default.
 *
 * 为 Zotero 中选中的 arXiv 条目自动获取 hjfy 中文翻译 PDF，
 * 导入为附件，并优先设为默认打开的 PDF。
 *
 * Compatible with Zotero 6、7、8、9、all.
 * 兼容 Zotero 6、7、8、9、all.
 *
 * @author Peaceful-World-X
 * @usage
 *   - Event: Create Item
 *   - Shortcut key: F4, or any custom shortcut
 *
 * @requires Zotero Actions & Tags
 * @see https://github.com/windingwind/zotero-actions-tags/discussions/614
 * @see https://hjfy.top/
 * @see More custom Zotero action scripts:
 * @see https://github.com/Peaceful-World-X/Zotero-Actions
 */

const Zotero = require("Zotero");
const ACTION_NAME = "[Action:Get hjfy CN_PDF]";

const CONFIG = {
  apiBase: "https://hjfy.top/api/arxivFiles/",
  arxivApiBase: "https://export.arxiv.org/api/query?id_list=",
  hjfyPageBase: "https://hjfy.top/arxiv/",
  attachmentPrefix: "幻觉翻译",
};

// Avoid duplicate runs when Actions & Tags executes both `items` and `item`.
if (
  typeof triggerType !== "undefined" &&
  (triggerType === "menu" || triggerType === "shortcut") &&
  typeof item !== "undefined" &&
  item
) {
  return;
}

function result(message) {
  return `${ACTION_NAME} ${message}.`;
}

function getField(zoteroItem, field) {
  try {
    return (zoteroItem.getField(field) || "").toString().trim();
  } catch (_) {
    return "";
  }
}

function getAttachmentName(attachment) {
  try {
    return (
      attachment.getFilename?.() ||
      attachment.attachmentFilename ||
      attachment.getField("title") ||
      attachment.key ||
      "unknown.pdf"
    );
  } catch (_) {
    return "unknown.pdf";
  }
}

function showAlert(message) {
  try {
    const win = Zotero.getMainWindow ? Zotero.getMainWindow() : null;
    const prompts = Components.classes[
      "@mozilla.org/embedcomp/prompt-service;1"
    ].getService(Components.interfaces.nsIPromptService);

    prompts.alert(win, ACTION_NAME, message);
  } catch (error) {
    Zotero.logError(error);

    const win = Zotero.getMainWindow && Zotero.getMainWindow();
    if (win && win.alert) {
      win.alert(`${ACTION_NAME}\n\n${message}`);
    }
  }
}

function openHjfyPage(arxivId) {
  if (!arxivId) return;

  try {
    Zotero.launchURL(CONFIG.hjfyPageBase + encodeURIComponent(arxivId));
  } catch (error) {
    Zotero.logError(error);
  }
}

function errorWithCode(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function getItemByID(id) {
  if (Zotero.Items.getAsync) {
    return Zotero.Items.getAsync(id);
  }
  return Zotero.Items.get(id);
}

function normalizeArxivId(id) {
  return id
    .trim()
    .replace(/^arxiv[:.\s]+/i, "")
    .replace(/\.pdf$/i, "")
    .replace(/v\d+$/i, "");
}

function extractArxivId(text) {
  if (!text) return null;

  const idPattern = "([a-z0-9.-]+\\/\\d{7}|\\d{4}\\.\\d{4,5})(?:v\\d+)?";

  const patterns = [
    new RegExp(`10\\.48550/arxiv\\.${idPattern}`, "i"),
    new RegExp(`arxiv\\.org/(?:abs|pdf|html)/${idPattern}`, "i"),
    new RegExp(`arxiv(?:\\s*id)?[:.\\s]+${idPattern}`, "i"),
    new RegExp(`^${idPattern}$`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return normalizeArxivId(match[1]);
  }

  return null;
}

function getArxivId(zoteroItem) {
  const fields = ["arXiv", "DOI", "url", "archiveID", "extra"];

  for (const field of fields) {
    const arxivId = extractArxivId(getField(zoteroItem, field));
    if (arxivId) return arxivId;
  }

  return null;
}

async function getParentItem(rawItem) {
  if (!rawItem) return null;

  if (typeof rawItem.isAttachment === "function" && rawItem.isAttachment()) {
    return rawItem.parentID ? await getItemByID(rawItem.parentID) : null;
  }

  return rawItem;
}

async function arxivExists(arxivId) {
  try {
    const res = await fetch(CONFIG.arxivApiBase + encodeURIComponent(arxivId), {
      headers: { Accept: "application/atom+xml" },
    });

    if (!res.ok) return null;

    const xml = await res.text();

    if (/<opensearch:totalResults[^>]*>\s*0\s*<\/opensearch:totalResults>/i.test(xml)) {
      return false;
    }

    return /<entry[\s>]/i.test(xml) ? true : null;
  } catch (error) {
    Zotero.logError(error);
    return null;
  }
}

async function getHjfyPdfUrl(arxivId) {
  const res = await fetch(CONFIG.apiBase + encodeURIComponent(arxivId), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw errorWithCode("PENDING", "hjfy has not translated this paper yet.");
  }

  const json = await res.json();

  if (!json || json.status !== 0 || !json.data || !json.data.zhCN) {
    throw errorWithCode("PENDING", "hjfy has not translated this paper yet.");
  }

  return new URL(json.data.zhCN, "https://hjfy.top/").href;
}

async function downloadPdf(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/pdf,*/*" },
  });

  if (!res.ok) {
    throw errorWithCode("PENDING", "hjfy PDF is not ready yet.");
  }

  const buffer = await res.arrayBuffer();
  const magic = String.fromCharCode(...new Uint8Array(buffer.slice(0, 5)));

  if (magic !== "%PDF-") {
    throw errorWithCode("PENDING", "hjfy returned a non-PDF response.");
  }

  return buffer;
}

function sanitizeFilename(name) {
  return (name || "arxiv")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "arxiv";
}

function writeBufferToFile(file, buffer) {
  return new Promise((resolve, reject) => {
    const stream = Components.classes[
      "@mozilla.org/network/file-output-stream;1"
    ].createInstance(Components.interfaces.nsIFileOutputStream);

    try {
      // PR_WRONLY | PR_CREATE_FILE | PR_TRUNCATE
      stream.init(file, 0x02 | 0x08 | 0x20, 0o666, 0);

      const binary = Components.classes[
        "@mozilla.org/binaryoutputstream;1"
      ].createInstance(Components.interfaces.nsIBinaryOutputStream);

      binary.setOutputStream(stream);
      binary.writeByteArray(new Uint8Array(buffer), buffer.byteLength);
      binary.close();

      resolve();
    } catch (error) {
      reject(error);
    } finally {
      try {
        stream.close();
      } catch (_) {}
    }
  });
}

async function findExistingHjfyAttachment(parentItem, arxivId) {
  const attachmentIds = parentItem.getAttachments();
  const safeArxivId = arxivId ? arxivId.replace(/[/:]/g, "_") : "";

  for (const id of attachmentIds) {
    const attachment = await getItemByID(id);
    if (!attachment) continue;

    const title = getField(attachment, "title");
    const url = getField(attachment, "url");
    const filename =
      typeof attachment.getFilename === "function"
        ? attachment.getFilename() || ""
        : "";

    const isHjfyAttachment =
      title.includes(CONFIG.attachmentPrefix) ||
      filename.toLowerCase().includes("hjfy_arxiv_") ||
      (arxivId && url.includes(CONFIG.hjfyPageBase + arxivId)) ||
      (safeArxivId && filename.includes(`hjfy_arxiv_${safeArxivId}`));

    if (!isHjfyAttachment) continue;

    try {
      if (typeof attachment.fileExists === "function") {
        const exists = await attachment.fileExists();
        if (!exists) continue;
      }
    } catch (error) {
      Zotero.logError(error);
      continue;
    }

    return attachment;
  }

  return null;
}

async function preferPdfWithoutPlugin(pdfAttachment, parentItem) {
  try {
    if (
      !pdfAttachment ||
      !parentItem ||
      !pdfAttachment.isPDFAttachment ||
      !pdfAttachment.isPDFAttachment()
    ) {
      return false;
    }

    let oldestPDFDate = new Date();

    for (const attachmentID of parentItem.getAttachments()) {
      const attachment = await getItemByID(attachmentID);

      if (
        !attachment ||
        !attachment.isPDFAttachment ||
        !attachment.isPDFAttachment()
      ) {
        continue;
      }

      const date = new Date(attachment.dateAdded);
      if (!isNaN(date) && date.getTime() < oldestPDFDate.getTime()) {
        oldestPDFDate = date;
      }
    }

    const preferredDate = new Date(oldestPDFDate.getTime() - 1000);
    pdfAttachment.setField("url", parentItem.getField("url") || "");
    pdfAttachment.dateAdded = preferredDate.toISOString();

    await pdfAttachment.saveTx();

    if (parentItem.clearBestAttachmentState) {
      parentItem.clearBestAttachmentState();
    }

    return true;
  } catch (error) {
    Zotero.logError(error);
    return false;
  }
}

async function importPdf(parentItem, arxivId, buffer) {
  const title = parentItem.getDisplayTitle
    ? parentItem.getDisplayTitle()
    : getField(parentItem, "title");

  const safeArxivId = arxivId.replace(/[/:]/g, "_");
  const filename = sanitizeFilename(`${title}_hjfy_arxiv_${safeArxivId}`) + ".pdf";

  const tempDir = Zotero.getTempDirectory();
  tempDir.append("hjfy-arxiv");

  if (!tempDir.exists()) {
    tempDir.create(1, 0o755);
  }

  const tempFile = tempDir.clone();
  tempFile.append(filename);

  try {
    await writeBufferToFile(tempFile, buffer);

    const attachment = await Zotero.Attachments.importFromFile({
      file: tempFile,
      parentItemID: parentItem.id,
      title: `${CONFIG.attachmentPrefix} - ${title}`,
      contentType: "application/pdf",
    });

    try {
      attachment.setField("url", CONFIG.hjfyPageBase + arxivId);
      await attachment.saveTx();
    } catch (error) {
      Zotero.logError(error);
    }
    await preferPdfWithoutPlugin(attachment, parentItem);

    return attachment;
  } finally {
    try {
      if (tempFile.exists()) tempFile.remove(false);
    } catch (error) {
      Zotero.logError(error);
    }
  }
}

async function translateItem(rawItem) {
  const parentItem = await getParentItem(rawItem);

  if (!parentItem || (parentItem.isRegularItem && !parentItem.isRegularItem())) {
    throw errorWithCode("NOT_ARXIV", "不是 arXiv 论文");
  }

  const title = parentItem.getDisplayTitle
    ? parentItem.getDisplayTitle()
    : getField(parentItem, "title");

  const arxivId = getArxivId(parentItem);

  const existingAttachment = await findExistingHjfyAttachment(parentItem, arxivId);
  if (existingAttachment) {
    return {
      status: "exists",
      title,
      arxivId,
      fileName: getAttachmentName(existingAttachment),
    };
  }

  if (!arxivId) {
    throw errorWithCode("NOT_ARXIV", "不是 arXiv 论文");
  }

  let pdfUrl;

  try {
    pdfUrl = await getHjfyPdfUrl(arxivId);
  } catch (error) {
    if (error.code !== "PENDING") throw error;

    const exists = await arxivExists(arxivId);
    if (exists === false) {
      throw errorWithCode("NOT_ARXIV", "不是 arXiv 论文");
    }

    return { status: "pending", title, arxivId };
  }

  const pdfBuffer = await downloadPdf(pdfUrl);
  await importPdf(parentItem, arxivId, pdfBuffer);

  return { status: "success", title, arxivId };
}

const selectedItems =
  typeof items !== "undefined" && Array.isArray(items) && items.length
    ? items
    : typeof item !== "undefined" && item
      ? [item]
      : [];

const uniqueItems = [];
const seen = new Set();

for (const rawItem of selectedItems) {
  const parent = await getParentItem(rawItem);
  if (!parent || seen.has(parent.id)) continue;

  seen.add(parent.id);
  uniqueItems.push(parent);
}

if (!uniqueItems.length) {
  showAlert("未选择可处理的 Zotero 条目。");
  return result("failed");
}

const success = [];
const existing = [];
const pending = [];
const notArxiv = [];
const failed = [];

for (const selectedItem of uniqueItems) {
  try {
    const output = await translateItem(selectedItem);

    if (output.status === "success") success.push(output);
    if (output.status === "exists") existing.push(output);
    if (output.status === "pending") pending.push(output);
  } catch (error) {
    const title = selectedItem.getDisplayTitle
      ? selectedItem.getDisplayTitle()
      : getField(selectedItem, "title");

    if (error.code === "NOT_ARXIV") {
      notArxiv.push(title);
    } else {
      failed.push(`${title}: ${error.message || error}`);
    }

    Zotero.logError(error);
  }
}

// Open hjfy directly for the first pending paper.
if (pending.length) {
  openHjfyPage(pending[0].arxivId);
}

// Only real failures and non-arXiv items use a titled alert.
const alertMessages = [];

if (notArxiv.length) {
  alertMessages.push(
    "不是 arXiv 论文：",
    ...notArxiv.map((title) => `- ${title}`)
  );
}

if (failed.length) {
  alertMessages.push(
    "获取失败：",
    ...failed.map((message) => `- ${message}`)
  );
}

if (alertMessages.length) {
  showAlert(alertMessages.join("\n\n"));
  return;
}

if (pending.length) {
  return result("waiting for hjfy translation");
}

if (existing.length && !success.length) {
  return [
    `${ACTION_NAME} file already exists:`,
    ...existing.map((entry) => `- ${entry.fileName || entry.title}`),
  ].join("\n");
}

return result("successfully get");