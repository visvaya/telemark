import { openMenu } from "./support/app";
import { expect, test } from "./support/fixtures";

// The watch of every test reports a focus lost with its element; here it is set off on purpose.
test.use({ expectedProblems: /^console error: focus lost: <button> "Do usunięcia"/ });

test("the tests' watch reports a focus lost with a removed element, and not a click on the background", async ({
  page,
  pageProblems,
}) => {
  await openMenu(page);
  await page.mouse.click(2, 2);
  await page.waitForTimeout(500);
  expect(pageProblems).toEqual([]);

  await page.evaluate(() => {
    const button = document.createElement("button");
    button.textContent = "Do usunięcia";
    document.body.append(button);
    button.focus();
    button.remove();
  });
  await expect.poll(() => pageProblems.length).toBe(1);
  expect(pageProblems[0]).toMatch(/focus lost: <button> "Do usunięcia" was removed or hidden/);
});
