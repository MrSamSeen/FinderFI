const express = require("express");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const sharp = require("sharp");
const os = require("os");

const app = express();
const rootDir = path.join(os.homedir(), "Documents"); // Change this to your target directory
const port = 3000;

// Get local IP address
function getIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

// Generate thumbnail for images
async function generateThumbnail(filePath) {
  try {
    return await sharp(filePath)
      .resize(100)
      .jpeg({ quality: 80 })
      .toBuffer()
      .then((data) => `data:image/jpeg;base64,${data.toString("base64")}`);
  } catch (err) {
    return null;
  }
}

// Serve static files
app.use(
  "/file",
  express.static(rootDir, {
    setHeaders: (res, filePath) => {
      res.set(
        "Content-Disposition",
        `attachment; filename="${path.basename(filePath)}"`
      );
    },
  })
);

// Directory listing
app.use("/browse", async (req, res, next) => {
  const currentPath = path.join(rootDir, req.path);

  if (!currentPath.startsWith(rootDir)) {
    return res.status(403).send("Forbidden");
  }

  fs.readdir(currentPath, { withFileTypes: true }, async (err, items) => {
    if (err) return next(err);

    const files = await Promise.all(
      items.map(async (item) => {
        const itemPath = path.join(req.path, item.name);
        const fullPath = path.join(currentPath, item.name);
        const isDirectory = item.isDirectory();
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(item.name);
        const isVideo = /\.(mp4|mov|avi|mkv)$/i.test(item.name);

        let thumbnail = null;
        if (isImage) {
          thumbnail = await generateThumbnail(fullPath);
        }

        return {
          name: item.name,
          path: itemPath,
          isDirectory,
          isImage,
          isVideo,
          thumbnail,
          mimeType: mime.lookup(item.name),
        };
      })
    );

    const parentPath = path.dirname(req.path);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>File Browser</title>
        <style>
          ${fs.readFileSync(path.join(__dirname, "views", "style.css"), "utf8")}
        </style>
      </head>
      <body>
        <div class="header">
          <a href="/browse/" class="button">Home</a>
          ${
            req.path !== "/"
              ? `<a href="/browse/${parentPath}" class="button">Up</a>`
              : ""
          }
        </div>
        <div class="file-list">
          ${files
            .map(
              (file) => `
            <div class="file-item">
              ${
                file.isDirectory
                  ? `
                <a href="/browse/${file.path}">
                  <div class="icon folder"></div>
                  <span>${file.name}/</span>
                </a>
              `
                  : `
                <a href="/file/${file.path}" download>
                  ${
                    file.thumbnail
                      ? `
                    <div class="thumbnail" style="background-image: url('${file.thumbnail}')"></div>
                  `
                      : `
                    <div class="icon ${file.isVideo ? "video" : "file"}"></div>
                  `
                  }
                  <span>${file.name}</span>
                </a>
              `
              }
            </div>
          `
            )
            .join("")}
        </div>
      </body>
      </html>
    `);
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running at http://${getIP()}:${port}/browse/`);
});
