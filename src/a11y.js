// Focus handling and screen-reader announcements shared by the panel, the
// drawer and the timeline.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const visible = (el) => el.offsetWidth || el.offsetHeight || el.getClientRects().length;

/**
 * Keeps Tab inside `container` while it is open and puts focus back where it
 * came from on release. Returns the release function.
 */
export function trapFocus(container, { onEscape } = {}) {
  const previous = document.activeElement;

  const onKeyDown = (e) => {
    if (e.key === "Escape" && onEscape) { onEscape(); return; }
    if (e.key !== "Tab") return;
    const items = [...container.querySelectorAll(FOCUSABLE)].filter(visible);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !container.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  container.addEventListener("keydown", onKeyDown);
  const target = container.querySelector(FOCUSABLE);
  if (target) target.focus({ preventScroll: true });

  return () => {
    container.removeEventListener("keydown", onKeyDown);
    if (previous && previous.isConnected) previous.focus({ preventScroll: true });
  };
}

let region = null;
let timer = null;

/**
 * Announces politely, and only once the value stops changing — the camera
 * crosses years continuously while scrolling and narrating every one is noise.
 */
export function announce(message, delay = 500) {
  if (!region) {
    region = document.createElement("p");
    region.className = "sr-only";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  clearTimeout(timer);
  timer = setTimeout(() => { region.textContent = message; }, delay);
}
