import fs from "fs";

const wPath = new URL("../src/assets/white_logo.svg", import.meta.url);
let w = fs.readFileSync(wPath, "utf8");
w = w.replace(
  /<svg version="1.1" xmlns="http:\/\/www.w3.org\/2000\/svg" width="988" height="482">/,
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 988 482" width="988" height="482" preserveAspectRatio="xMidYMid meet">',
);
const emptyRun =
  /<path d="" fill="#000000" transform="translate\(0,0\)"\/>(\s*<path d="" fill="#000000" transform="translate\(0,0\)"\/>)*/;
const idx = w.search(emptyRun);
if (idx === -1) {
  console.error("white_logo: no empty path run found");
  process.exit(1);
}
w = w.slice(0, idx) + "\n</svg>\n";
fs.writeFileSync(wPath, w);
const pubWhite = new URL("../public/white_logo.svg", import.meta.url);
fs.copyFileSync(wPath, pubWhite);

const bPath = new URL("../src/assets/black_logo.svg", import.meta.url);
let b = fs.readFileSync(bPath, "utf8");
b = b.replace(/^\s*<\?xml[^>]*>\s*/i, "");
const open = b.match(/^<svg[^>]*>/);
if (!open) {
  console.error("black_logo: no opening svg");
  process.exit(1);
}
let inner = b.slice(open[0].length).replace(/<\/svg>\s*$/i, "");
const lines = inner.split(/\r?\n/);
const withoutBg = lines.filter((line) => {
  const t = line.trim();
  if (!t.startsWith("<path")) return true;
  return !(
    t.includes('fill="#FEFEFE"') &&
    t.includes("500 500") &&
    t.includes("translate(0,0)")
  );
});
const paths = withoutBg.join("\n").trim();
const out =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 988 482" width="988" height="482" preserveAspectRatio="xMidYMid meet">\n' +
  '<g transform="translate(0, 5) scale(2.1) translate(-16, -112)">\n' +
  paths +
  "\n" +
  "</g>\n</svg>\n";
fs.writeFileSync(bPath, out);

const pub = new URL("../public/black_logo.svg", import.meta.url);
fs.copyFileSync(bPath, pub);

console.log("OK", { white: fs.statSync(wPath).size, black: fs.statSync(bPath).size });
