import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const outputDir = process.env.QA_SCREENSHOT_DIR || "visual-qa";
fs.mkdirSync(outputDir, { recursive: true });

const executableCandidates = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("No system Chromium/Chrome executable found");

const viewports = [
  { name: "android-small", width: 360, height: 800 },
  { name: "iphone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
];

const routes = ["/", "/login", "/signup", "/privacy", "/terms", "/qa/workspace"];
const failures = [];
const checks = [];

function record(ok, detail) {
  checks.push({ ok, detail });
  if (!ok) failures.push(detail);
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport });
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));

      const url = new URL(route, baseUrl).toString();
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      record(Boolean(response && response.ok()), `${viewport.name} ${route}: HTTP ${response?.status() ?? "no response"}`);

      const layout = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));
      record(
        layout.documentWidth <= layout.innerWidth + 1 && layout.bodyWidth <= layout.innerWidth + 1,
        `${viewport.name} ${route}: no horizontal overflow (document=${layout.documentWidth}, viewport=${layout.innerWidth})`,
      );

      if (viewport.width <= 430) {
        const smallEditable = await page.locator("input:not([type='hidden']), textarea, select").evaluateAll((elements) =>
          elements
            .filter((element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
            })
            .map((element) => ({ tag: element.tagName, fontSize: Number.parseFloat(getComputedStyle(element).fontSize) }))
            .filter((entry) => entry.fontSize < 16),
        );
        record(smallEditable.length === 0, `${viewport.name} ${route}: mobile editable controls are at least 16px: ${JSON.stringify(smallEditable)}`);
      }

      if (route === "/qa/workspace") {
        const composer = page.locator("textarea").last();
        const composerBox = await composer.boundingBox();
        record(Boolean(composerBox), `${viewport.name} workspace: composer is visible`);
        if (composerBox) {
          record(
            composerBox.x >= -1 &&
              composerBox.x + composerBox.width <= viewport.width + 1 &&
              composerBox.y >= -1 &&
              composerBox.y + composerBox.height <= viewport.height + 1,
            `${viewport.name} workspace: composer stays inside viewport ${JSON.stringify(composerBox)}`,
          );
        }

        const screenshotPath = path.join(outputDir, `workspace-${viewport.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        if (viewport.width <= 430) {
          const navButton = page.getByRole("button", { name: "Open navigation" });
          record((await navButton.count()) === 1, `${viewport.name} workspace: mobile navigation button is present`);
          if ((await navButton.count()) === 1) {
            await navButton.click();
            await page.getByRole("button", { name: "Close navigation" }).first().waitFor({ state: "visible" });
            const drawerWidth = await page.locator("aside").last().boundingBox().catch(() => null);
            if (drawerWidth) {
              record(drawerWidth.width <= viewport.width, `${viewport.name} workspace: navigation drawer fits viewport`);
            }
            await page.screenshot({ path: path.join(outputDir, `workspace-nav-${viewport.name}.png`), fullPage: false });
          }
        }
      }

      if (route === "/") {
        await page.screenshot({ path: path.join(outputDir, `landing-${viewport.name}.png`), fullPage: true });
      }

      record(consoleErrors.length === 0, `${viewport.name} ${route}: no console/page errors${consoleErrors.length ? `: ${consoleErrors.join(" | ")}` : ""}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const report = { baseUrl, executablePath, checks, failures };
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");

const passed = checks.length - failures.length;
console.log(`Visual QA checks: ${passed}/${checks.length} passed`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
