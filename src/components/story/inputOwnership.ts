// Who a wheel or key event belongs to. The project reader and the experience
// line both listen on the whole window while they're on screen, so they need
// to leave alone the input that something else on the page should get.

/** True if `target` sits inside something else that can scroll vertically. */
export function scrollsElsewhere(target: Element | null, stopAt: Element): boolean {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (el === stopAt) return false;
    if (el.matches('[role="dialog"], [data-piano-player]')) return true;
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return true;
  }
  return false;
}

/** Keys that type or activate shouldn't scroll the page instead. */
export function ownsKeys(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [role="dialog"]') !==
      null
  );
}
