const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 5173);
const dataFile = path.join(root, "data.json");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (requestUrl.pathname === "/api/state") {
    if (request.method === "GET") {
      fs.readFile(dataFile, "utf8", (error, content) => {
        if (error) {
          response.writeHead(204);
          response.end();
          return;
        }

        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(content);
      });
      return;
    }

    if (request.method === "PUT") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
        if (body.length > 25 * 1024 * 1024) request.destroy();
      });
      request.on("end", () => {
        try {
          JSON.parse(body);
          fs.writeFile(dataFile, body, "utf8", (error) => {
            if (error) {
              response.writeHead(500);
              response.end("Cannot save data");
              return;
            }

            response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ ok: true }));
          });
        } catch {
          response.writeHead(400);
          response.end("Invalid JSON");
        }
      });
      return;
    }

    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }

  const requestedPath = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(content);
  });
});

server.listen(port, () => {
  console.log(`Prenotazioni Etoile: http://localhost:${port}`);
});
