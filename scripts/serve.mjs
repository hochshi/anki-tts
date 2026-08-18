// Zero-dependency static file server for testing the built src/anki_tts.js locally,
// e.g. from an Anki card template, before publishing to GitHub/npm.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.argv[2] || process.env.PORT || 8934);
const ROOT = process.cwd();

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(ROOT, path === "/" ? "/local_test.html" : path);
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");

    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    });
    res.end(await readFile(filePath));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found: " + req.url);
  }
}).listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://127.0.0.1:${PORT}/`);
  console.log(`Anki card template script src: http://127.0.0.1:${PORT}/src/anki_tts.js`);
});
