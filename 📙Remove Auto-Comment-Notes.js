/**
 * Remove automatic Comment notes and append their contents to Extra.
 * Solves: https://forums.zotero.org/discussion/76496
 * @author Peaceful-World-X
 * @usage You can assign a custom shortcut key or use it in appendNote/createItem actions
 * @link https://github.com/windingwind/zotero-actions-tags/discussions/601
 */
(async () => {
  const notes = await Zotero.Items.getAsync(item.getNotes());
  const comments = [];

  for (const note of notes) {
    const text = (note.getNote() || "").replace(/<[^>]+>/g, "").trim();
    if (/^Comment/i.test(text)) {
      comments.push(text);
      await note.eraseTx();
    }
  }

  if (comments.length) {
    const appended = comments.join("\n");
    const extra = (item.getField("extra") || "").trim();
    item.setField("extra", extra ? `${extra}\n${appended}` : appended);
    await item.saveTx();
  }
})();