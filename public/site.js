/* Progressive enhancement: the links and form also work without JavaScript. */
/** Keep copy feedback visible briefly before restoring the button label. */
const COPY_FEEDBACK_MS = 1600;
/** Allow the server's webhook timeout and the response trip to finish. */
const CONTACT_TIMEOUT_MS = 15000;
const copyButton = document.querySelector("[data-copy-email]");
const email = document.getElementById("contact-email");

if (copyButton && email) {
  const label = copyButton.textContent;
  let restoreTimer;
  copyButton.addEventListener("click", async () => {
    let feedback;
    try {
      await navigator.clipboard.writeText(email.textContent.trim());
      feedback = copyButton.dataset.copied;
    } catch {
      const range = document.createRange();
      range.selectNodeContents(email);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      feedback = copyButton.dataset.selected;
    }
    copyButton.textContent = feedback;
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => { copyButton.textContent = label; }, COPY_FEEDBACK_MS);
  });
}

const enquiry = document.querySelector("form.enquiry");
if (enquiry) {
  const submit = enquiry.querySelector('button[type="submit"]');
  const status = enquiry.querySelector(".form-status");
  const label = submit.textContent;
  enquiry.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled || !enquiry.reportValidity()) return;
    submit.disabled = true;
    submit.textContent = enquiry.dataset.sending;
    status.hidden = true;
    try {
      const response = await fetch(enquiry.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(enquiry),
        signal: AbortSignal.timeout(CONTACT_TIMEOUT_MS),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error("Delivery failed");
      status.textContent = enquiry.dataset.success;
      status.className = "form-status ok";
      enquiry.reset();
    } catch {
      status.textContent = enquiry.dataset.error;
      status.className = "form-status error";
    } finally {
      status.hidden = false;
      submit.disabled = false;
      submit.textContent = label;
    }
  });
}
