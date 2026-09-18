#!/usr/bin/env node
// Zero-dependency static server. ES modules need an http origin, file:// won't do.
// Sends validators and cache policy so a reload does not re-download 17MB of
// covers: art is immutable and cached hard, everything else revalidates.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif"
};

const cacheControl = (rel) =>
  rel.startsWith("assets/covers/") ? "public, max-age=31536000, immutable" : "no-cache";

createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const rel = normalize(url === "/" ? "/index.html" : url).replace(/^(\.\.[/\\])+/, "").replace(/^\//, "");
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }

  try {
    const info = await stat(file);
    const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
    const headers = {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "cache-control": cacheControl(rel),
      "last-modified": info.mtime.toUTCString(),
      etag
    };
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers).end(); return; }
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : await readFile(file));
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
