const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const mime = require("mime-types");
const sharp = require("sharp");
const os = require("os");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const rootDir = path.join(os.homedir(), "Documents");
const port = 3000;

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

async function generateImageThumbnail(filePath) {
  try {
    const buffer = await sharp(filePath)
      .resize(200, 200, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

async function generateVideoThumbnail(filePath) {
  return new Promise((resolve) => {
    const thumbnailPath = path.join(os.tmpdir(), `thumbnail-${Date.now()}.jpg`);

    ffmpeg(filePath)
      .on("end", async () => {
        try {
          const data = await fs.readFile(thumbnailPath);
          resolve(`data:image/jpeg;base64,${data.toString("base64")}`);
        } catch {
          resolve(null);
        } finally {
          fs.unlink(thumbnailPath).catch(() => {});
        }
      })
      .on("error", () => resolve(null))
      .screenshots({
        timestamps: ["00:00:01"],
        filename: thumbnailPath,
        folder: os.tmpdir(),
        size: "200x200",
      });
  });
}

app.use("/public", express.static(path.join(__dirname, "public")));
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

app.use((req, res, next) => {
  const requestedPath = req.path
    .split("/")
    .filter((p) => p && !p.includes(".."))
    .join(path.sep);

  const fullPath = path.join(rootDir, requestedPath);

  if (!fullPath.startsWith(rootDir)) {
    return res.status(403).send("Forbidden");
  }

  req.safePath = fullPath;
  req.relativePath = requestedPath ? `/${requestedPath}` : "/";
  next();
});

app.use("/", async (req, res, next) => {
  try {
    const currentPath = req.safePath;
    const items = await fs.readdir(currentPath, { withFileTypes: true });

    // Filter out hidden files/folders (those starting with .)
    const visibleItems = items.filter((item) => !item.name.startsWith("."));

    const files = await Promise.all(
      visibleItems.map(async (item) => {
        const fullPath = path.join(currentPath, item.name);
        const stats = await fs.stat(fullPath);
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(item.name);
        const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(item.name);

        return {
          name: item.name,
          encodedName: encodeURIComponent(item.name),
          isDirectory: item.isDirectory(),
          isImage,
          isVideo,
          size: stats.size,
          created: stats.birthtime,
          thumbnail: isImage
            ? await generateImageThumbnail(fullPath)
            : isVideo
            ? await generateVideoThumbnail(fullPath)
            : null,
        };
      })
    );

    const template = await fs.readFile(
      path.join(__dirname, "views", "index.html"),
      "utf8"
    );
    const parentPath = path.dirname(req.relativePath);

    const html = template
      .replace("{{HEADER}}", generateHeader(req.relativePath, parentPath))
      .replace("{{FILES}}", generateFileList(files, req.relativePath));

    res.send(html);
  } catch (err) {
    next(err);
  }
});

function generateHeader(currentPath, parentPath) {
  return `
    <div class="header">
      <a href="/" class="button">Home</a>
      ${
        currentPath !== "/"
          ? `<a href="${parentPath}" class="button">Up</a>`
          : ""
      }
    </div>
  `;
}

function generateFileList(files, currentPath) {
  return files
    .map(
      (file) => `
    <div class="file-item" data-name="${file.name.toLowerCase()}">
      ${
        file.isDirectory
          ? `
        <a href="${currentPath}${file.encodedName}/">
          <div class="icon folder"></div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
              <span>${formatDate(file.created)}</span>
            </div>
          </div>
        </a>
      `
          : `
        <a href="/file${currentPath}${file.encodedName}" download>
          ${
            file.thumbnail
              ? `
            <div class="thumbnail-container">
              <div class="thumbnail" style="background-image: url('${
                file.thumbnail
              }')"></div>
              ${file.isVideo ? '<div class="video-overlay">▶</div>' : ""}
            </div>
          `
              : `
            <div class="icon ${file.isVideo ? "video" : "file"}"></div>
          `
          }
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
              <span>${formatSize(file.size)}</span>
              <span>${formatDate(file.created)}</span>
            </div>
          </div>
        </a>
      `
      }
    </div>
  `
    )
    .join("");
}

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running at http://${getIP()}:${port}/`);
});
