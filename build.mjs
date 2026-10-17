// Copies the website files into dist/ for Vercel. No compiling, nothing to install.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const files = [
  "index.html",
  "app.html",
  "app.css",
  "app.js",
  "hero-1.mp4",
  "hero-2.mp4",
  "hero-3.mp4",
  "hero-4.mp4",
  "hero-1-m.mp4",
  "hero-2-m.mp4",
  "hero-3-m.mp4",
  "hero-4-m.mp4",
];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const f of files) {
  if (existsSync(f)) {
    cpSync(f, `dist/${f}`);
    console.log("copied", f);
  } else {
    console.log("skipped (not found)", f);
  }
}
for (const f of ["index.html", "app.html", "app.js", "app.css"]) {
  if (!existsSync(f)) throw new Error(`${f} is missing from the repo. Upload it and redeploy.`);
}
