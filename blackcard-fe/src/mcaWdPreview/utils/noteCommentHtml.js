const ALLOWED_TAGS = new Set([
  "DIV",
  "P",
  "BR",
  "SPAN",
  "IMG",
  "B",
  "I",
  "STRONG",
  "EM",
  "UL",
  "OL",
  "LI",
]);

export const NOTE_PASTE_MAX_BYTES = 5 * 1024 * 1024;
export const NOTE_COMMENT_MAX_IMAGES = 10;

export function noteHtmlHasImage(value) {
  return /<img\b/i.test(String(value || ""));
}

export function escapeNoteHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isAllowedImageSrc(src) {
  const s = String(src || "").trim();
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return true;
  return false;
}

function unwrapElement(el) {
  const parent = el.parentNode;
  if (!parent) {
    el.remove();
    return;
  }
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

function sanitizeElement(el) {
  if (!ALLOWED_TAGS.has(el.tagName)) {
    [...el.childNodes].forEach((child) => {
      if (child.nodeType === 1) sanitizeElement(child);
    });
    unwrapElement(el);
    return;
  }

  if (el.tagName === "IMG") {
    const src = el.getAttribute("src");
    [...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
    if (!isAllowedImageSrc(src)) {
      el.remove();
      return;
    }
    el.setAttribute("src", src);
    el.setAttribute("alt", "Pasted image");
    return;
  }

  [...el.attributes].forEach((attr) => {
    const name = String(attr.name || "").toLowerCase();
    if (name.startsWith("on") || name === "style" || name === "class" || name === "id") {
      el.removeAttribute(attr.name);
    }
  });
  [...el.childNodes].forEach((child) => {
    if (child.nodeType === 1) sanitizeElement(child);
  });
}

export function sanitizeNoteHtml(html) {
  const raw = String(html ?? "");
  if (!raw) return "";
  if (typeof document === "undefined") return escapeNoteHtml(raw);
  const template = document.createElement("template");
  template.innerHTML = raw;
  [...template.content.childNodes].forEach((child) => {
    if (child.nodeType === 1) sanitizeElement(child);
    else if (child.nodeType !== 3) child.remove();
  });
  return template.innerHTML;
}

export function storedValueToEditorHtml(value) {
  const s = String(value ?? "");
  if (!s) return "";
  if (!/<[a-z][\s\S]*>/i.test(s)) {
    return escapeNoteHtml(s).replace(/\n/g, "<br>");
  }
  return sanitizeNoteHtml(s);
}

export function serializeEditorHtml(editorEl) {
  if (!editorEl) return "";
  if (!editorEl.querySelector("img")) {
    return String(editorEl.innerText || "")
      .replace(/\u00a0/g, " ")
      .replace(/\n+$/g, "");
  }
  return sanitizeNoteHtml(editorEl.innerHTML);
}

export function noteCommentToPlainText(value) {
  const s = String(value ?? "");
  if (!s) return "";
  if (!/<[a-z][\s\S]*>/i.test(s)) return s;
  const withMarks = s.replace(/<img\b[^>]*>/gi, " [image] ");
  if (typeof document === "undefined") {
    return withMarks.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = sanitizeNoteHtml(withMarks);
  return String(tmp.innerText || tmp.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim();
}

export function countNoteImages(value) {
  const s = String(value ?? "");
  const matches = s.match(/<img\b/gi);
  return matches ? matches.length : 0;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result;
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      const mimeType = file.type || "application/octet-stream";
      resolve(`data:${mimeType};base64,${btoa(binary)}`);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

export function collectClipboardImageFiles(clipboardData) {
  const files = [];
  if (!clipboardData) return files;
  const items = clipboardData.items;
  if (items) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item && typeof item.type === "string" && item.type.startsWith("image/")) {
        const file = item.getAsFile?.();
        if (file) files.push(file);
      }
    }
  }
  if (files.length === 0 && clipboardData.files) {
    for (let i = 0; i < clipboardData.files.length; i += 1) {
      const file = clipboardData.files[i];
      if (file && typeof file.type === "string" && file.type.startsWith("image/")) {
        files.push(file);
      }
    }
  }
  return files;
}

export function insertNodeAtCursor(editorEl, node) {
  if (!editorEl || !node) return;
  editorEl.focus();
  const selection = window.getSelection();
  if (!selection) {
    editorEl.appendChild(node);
    return;
  }
  let range = null;
  if (selection.rangeCount > 0) {
    const current = selection.getRangeAt(0);
    if (editorEl.contains(current.commonAncestorContainer)) {
      range = current;
    }
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(editorEl);
    range.collapse(false);
  }
  range.deleteContents();
  range.insertNode(node);
  const spacer = document.createElement("br");
  if (node.nextSibling) {
    node.parentNode.insertBefore(spacer, node.nextSibling);
  } else if (node.parentNode) {
    node.parentNode.appendChild(spacer);
  }
  range.setStartAfter(spacer);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function insertTextAtCursor(text) {
  const value = String(text ?? "");
  if (!value) return;
  if (typeof document.execCommand === "function") {
    document.execCommand("insertText", false, value);
    return;
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(value);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function isInlinePastedNoteImage(img) {
  if (!img || img.nodeType !== 1) return false;
  if (img.closest?.(".note-comment-display")) return true;
  return img.getAttribute("alt") === "Pasted image";
}

/** Strip forced display-size rules so email/copy uses the image's natural dimensions. */
export function clearInlinePastedNoteImageForcedSize(img) {
  if (!img) return;
  let style = img.getAttribute("style") || "";
  style = style
    .replace(/max-width\s*:[^;]*;?/gi, "")
    .replace(/max-height\s*:[^;]*;?/gi, "")
    .replace(/(^|;)\s*width\s*:[^;]*;?/gi, "$1")
    .replace(/(^|;)\s*height\s*:[^;]*;?/gi, "$1")
    .replace(/object-fit\s*:[^;]*;?/gi, "")
    .replace(/;;+/g, ";")
    .trim();
  if (style) img.setAttribute("style", style);
  else img.removeAttribute("style");
  img.removeAttribute("width");
  img.removeAttribute("height");
}
