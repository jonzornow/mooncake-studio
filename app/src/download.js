import { zipSync } from "fflate";

export function isIOS(nav = navigator) {
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)
  );
}

export function canShareFile(file, nav = navigator) {
  try {
    return (
      typeof nav.share === "function" &&
      typeof nav.canShare === "function" &&
      nav.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

function requestDownload(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  // Keep the file alive while the browser's download prompt is open.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function download(data, name, type = "application/octet-stream") {
  const file = new File([data], name, { type });
  if (!isIOS()) {
    requestDownload(file);
    return true;
  }

  let shareFile = canShareFile(file) ? file : null;
  if (!shareFile && !name.endsWith(".zip")) {
    const zipped = new File(
      [zipSync({ [name]: new Uint8Array(await file.arrayBuffer()) })],
      `${name}.zip`,
      { type: "application/zip" },
    );
    if (canShareFile(zipped)) shareFile = zipped;
  }

  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.id = "file-save-dialog";
    dialog.className = "file-save-dialog";
    dialog.setAttribute("aria-labelledby", "file-save-title");
    dialog.innerHTML = `<h2 id="file-save-title">Save your file</h2>
      <p class="file-save-name"></p>
      <p class="file-save-message" role="status"></p>
      <div class="file-save-actions">
        <button class="primary" data-file-share>Share / Save to Files</button>
        <button data-file-download>Try download</button>
        <button data-file-close>Close</button>
      </div>
      <p class="small">If Firefox Focus cannot save the file, use Safari for exports. Keep this page open until you have saved your work; opening the site in another browser does not transfer your design.</p>`;
    const message = dialog.querySelector(".file-save-message");
    const share = dialog.querySelector("[data-file-share]");
    const retry = dialog.querySelector("[data-file-download]");
    const close = dialog.querySelector("[data-file-close]");
    dialog.querySelector(".file-save-name").textContent = name;
    share.hidden = !shareFile;
    message.textContent = shareFile
      ? shareFile === file
        ? "Tap Share / Save to Files, then choose Save to Files in the iPhone share sheet."
        : "This browser can share this file inside a ZIP. Save the ZIP to Files, then tap it there to unpack your file."
      : "This browser does not offer file sharing for this export. You can try downloading, but Firefox Focus may show an app prompt without saving anything.";
    if (shareFile && shareFile !== file)
      share.textContent = "Share ZIP / Save to Files";
    if (type === "application/json") {
      const recovery = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Recover project as text";
      const help = document.createElement("p");
      help.textContent =
        "If saving is blocked, copy this text into a plain-text file named mooncake-project.json. Open that file in Mooncake Studio to restore your design.";
      const text = document.createElement("textarea");
      text.readOnly = true;
      text.setAttribute("aria-label", "Project recovery text");
      text.value = String(data);
      text.onclick = () => text.select();
      recovery.append(summary, help, text);
      dialog.append(recovery);
    }
    let sharing = false;
    let completed = false;
    share.onclick = async () => {
      if (sharing) return;
      sharing = true;
      share.disabled = retry.disabled = close.disabled = true;
      try {
        // Call directly from this tap: iOS requires fresh user activation.
        await navigator.share({ files: [shareFile] });
        completed = true;
        dialog.close();
      } catch (error) {
        message.textContent =
          error.name === "AbortError"
            ? "Sharing was cancelled or no destination was available. Your work is still here; tap Share to try again."
            : "This browser could not share the file. Try downloading, or keep your work here and use Safari for future exports.";
      } finally {
        sharing = false;
        share.disabled = retry.disabled = close.disabled = false;
      }
    };
    retry.onclick = () => {
      try {
        requestDownload(file);
        message.textContent =
          "Download requested. Check Files before closing this page. An ‘another app’ prompt does not mean the file was saved.";
      } catch {
        message.textContent =
          "The download could not start. Keep this page open to preserve your work.";
      }
    };
    close.onclick = () => dialog.close();
    dialog.addEventListener("cancel", (event) => {
      if (sharing) event.preventDefault();
    });
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        resolve(completed);
      },
      { once: true },
    );
    document.body.append(dialog);
    dialog.showModal();
  });
}
