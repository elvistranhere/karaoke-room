import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "og.png");

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Be+Vietnam+Pro:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1200px;
        height: 630px;
        overflow: hidden;
        position: relative;
        background: #09090B;
        font-family: "Be Vietnam Pro", "Helvetica Neue", Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .glow { position: absolute; border-radius: 9999px; pointer-events: none; }
      .glow-a {
        width: 900px; height: 640px; top: -260px; left: -120px;
        background: #8B5CF6; opacity: 0.22; filter: blur(150px);
      }
      .glow-b {
        width: 560px; height: 420px; bottom: -200px; right: -60px;
        background: #F59E0B; opacity: 0.14; filter: blur(150px);
      }
      .frame {
        position: absolute; inset: 0; padding: 76px 80px;
        display: flex; flex-direction: column; justify-content: space-between;
      }
      .eyebrow {
        display: inline-flex; align-items: center; gap: 12px; align-self: flex-start;
        padding: 10px 20px; border-radius: 9999px;
        background: #18181B; color: #C9A7FF;
        font-size: 22px; font-weight: 600; letter-spacing: 0.02em;
      }
      .dot { width: 10px; height: 10px; border-radius: 9999px; background: #22C55E; }
      h1 {
        font-family: "Baloo 2", "Trebuchet MS", sans-serif;
        font-weight: 800; font-size: 128px; line-height: 1.02; letter-spacing: -0.03em;
        background: linear-gradient(135deg, #8B5CF6, #F59E0B);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      }
      .tagline {
        margin-top: 20px; font-size: 40px; line-height: 1.3; font-weight: 500;
        color: #FAFAFA; max-width: 900px;
      }
      .sub { margin-top: 14px; font-size: 27px; color: #A1A1AA; }
      .footer { display: flex; align-items: center; justify-content: space-between; }
      .chips { display: flex; gap: 14px; }
      .chip {
        padding: 13px 24px; border-radius: 16px; background: #18181B;
        color: #D4D4D8; font-size: 24px; font-weight: 500;
      }
      .code {
        display: flex; align-items: center; gap: 16px;
        color: #71717A; font-size: 24px; font-weight: 500;
      }
      .code b {
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        letter-spacing: 0.3em; font-size: 26px; color: #FAFAFA; font-weight: 700;
        background: #27272A; border-radius: 14px; padding: 12px 12px 12px 20px;
      }
    </style>
  </head>
  <body>
    <div class="glow glow-a"></div>
    <div class="glow glow-b"></div>
    <div class="frame">
      <div class="eyebrow"><span class="dot"></span>Free online karaoke rooms</div>
      <div>
        <h1>Karaoke Now</h1>
        <p class="tagline">Sing together with friends, from anywhere.</p>
        <p class="sub">Synced YouTube playback, live voice and effects. No signup, no download.</p>
      </div>
      <div class="footer">
        <div class="chips">
          <div class="chip">Voice effects</div>
          <div class="chip">Share music</div>
          <div class="chip">Sing together</div>
        </div>
        <div class="code">Join with a code <b>XXXXXX</b></div>
      </div>
    </div>
  </body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT, type: "png" });
await browser.close();
