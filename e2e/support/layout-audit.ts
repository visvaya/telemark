import type { Page } from "@playwright/test";

/**
 * Looks at the page as laid out and lists what a player would see as broken: a page that scrolls sideways, an
 * element that sticks out of the page, text cut off by its box or spilling out of it, and blocks drawn on top of
 * one another. An empty list means the layout holds. Elements hidden for screen readers only (`.sr-only`) are
 * left out: they are one pixel large by design. So is a text marked `data-ellipsis` that ends in an ellipsis where it
 * has no room (a name in the competition table): it keeps its full form for screen readers, and the full name shows
 * elsewhere in the game.
 */
export function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const SLACK_PX = 1;
    const problems: string[] = [];
    const root = document.documentElement;
    const name = (element: Element): string =>
      `<${element.tagName.toLowerCase()}> "${(element.getAttribute("aria-label") ?? element.textContent).trim().slice(0, 40)}"`;
    const shown = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && element.closest(".sr-only") === null;
    };
    /** Inside a text allowed to end in an ellipsis: its parts may run past its box, which cuts them off. */
    const ellipsed = (element: Element): boolean => {
      const holder = element.closest("[data-ellipsis]");
      return holder !== null && getComputedStyle(holder).textOverflow === "ellipsis";
    };

    if (root.scrollWidth > root.clientWidth) {
      problems.push(`the page scrolls sideways by ${root.scrollWidth - root.clientWidth} px`);
    }

    for (const element of document.querySelectorAll("body *")) {
      if (!shown(element)) continue;
      if (element.parentElement !== null && ellipsed(element.parentElement)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.left < -SLACK_PX || rect.right > root.clientWidth + SLACK_PX) {
        problems.push(
          `${name(element)} sticks out of the page (${Math.round(rect.left)} to ${Math.round(rect.right)} px)`,
        );
      }
      const style = getComputedStyle(element);
      const cuts = style.overflowX !== "visible" || style.overflowY !== "visible";
      const scrolls = style.overflowY === "auto" || style.overflowY === "scroll";
      const tooWide = element.scrollWidth > element.clientWidth + SLACK_PX;
      const tooTall = element.scrollHeight > element.clientHeight + SLACK_PX;
      const intended = ellipsed(element) && !tooTall;
      if (cuts && (tooWide || (tooTall && !scrolls)) && !intended && element !== root && element !== document.body) {
        problems.push(`${name(element)} cuts off its content`);
      }
      // Text of the element itself, measured as drawn: it must stay inside the element's box.
      const ownText = Array.from(element.childNodes).filter(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
      );
      for (const node of ownText) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const text = range.getBoundingClientRect();
        if (text.left < rect.left - SLACK_PX || text.right > rect.right + SLACK_PX) {
          problems.push(
            `text spills out of ${name(element)} by ${Math.round(Math.max(rect.left - text.left, text.right - rect.right))} px`,
          );
        }
      }
    }

    const blocks = Array.from(document.querySelectorAll("h1, h2, p, legend, button, label, canvas")).filter(shown);
    for (const [index, first] of blocks.entries()) {
      for (const second of blocks.slice(index + 1)) {
        if (first.contains(second) || second.contains(first)) continue;
        const a = first.getBoundingClientRect();
        const b = second.getBoundingClientRect();
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > SLACK_PX && overlapY > SLACK_PX) {
          problems.push(
            `${name(first)} and ${name(second)} overlap by ${Math.round(overlapX)} x ${Math.round(overlapY)} px`,
          );
        }
      }
    }
    return problems;
  });
}

/**
 * Pointer targets against WCAG 2.5.8: each is at least 24 by 24 CSS pixels, or a circle of that diameter around
 * its middle touches no other target and no such circle of another undersized one. Also lists targets that do not
 * receive the pointer in their middle, that is, something lies on top of them. A hidden input is measured by the
 * label that shows it.
 */
export function targetProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const MIN_PX = 24;
    const problems: string[] = [];
    const controls = Array.from(document.querySelectorAll("button, a[href], input, select, textarea, [role=button]"))
      .map((control) => control.closest("label") ?? control)
      .filter((control, index, all) => all.indexOf(control) === index)
      // An inert control is out of use on purpose (covered by the pause controls), so it is not a target.
      .filter((control) => control.closest("[inert]") === null)
      .filter((control) => {
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(control).visibility !== "hidden";
      });
    const name = (element: Element): string =>
      `"${(element.getAttribute("aria-label") ?? element.textContent).trim().slice(0, 40)}"`;
    const middle = (rect: DOMRect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    const small = (rect: DOMRect): boolean => rect.width < MIN_PX || rect.height < MIN_PX;
    /** Distance from a point to the nearest point of a box; zero inside it. */
    const distance = (point: { x: number; y: number }, rect: DOMRect): number =>
      Math.hypot(
        Math.max(rect.left - point.x, 0, point.x - rect.right),
        Math.max(rect.top - point.y, 0, point.y - rect.bottom),
      );

    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      const centre = middle(rect);
      const onScreen = centre.x >= 0 && centre.y >= 0 && centre.x <= innerWidth && centre.y <= innerHeight;
      const hit = document.elementFromPoint(centre.x, centre.y);
      if (onScreen && (hit === null || !control.contains(hit))) {
        problems.push(`${name(control)} is covered in its middle by <${hit?.tagName.toLowerCase() ?? "nothing"}>`);
      }
      if (!small(rect)) continue;
      for (const other of controls) {
        if (other === control) continue;
        const otherRect = other.getBoundingClientRect();
        const tooClose = small(otherRect)
          ? Math.hypot(centre.x - middle(otherRect).x, centre.y - middle(otherRect).y) < MIN_PX
          : distance(centre, otherRect) < MIN_PX / 2;
        if (tooClose) {
          problems.push(
            `${name(control)} is ${Math.round(rect.width)} x ${Math.round(rect.height)} px and too close to ${name(other)}`,
          );
        }
      }
    }
    return problems;
  });
}
