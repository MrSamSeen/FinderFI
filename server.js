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
const rootDir = path.join(os.homedir(), "/");
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
  } catch (err) {
    console.error(`Error generating image thumbnail for ${filePath}:`, err);
    return null;
  }
}

async function generateVideoThumbnail(filePath) {
  return new Promise((resolve) => {
    const tempFileName = `thumbnail-${Date.now()}.jpg`;
    const thumbnailDir = os.tmpdir();
    const thumbnailPath = path.join(thumbnailDir, tempFileName);

    ffmpeg(filePath)
      .on("end", async () => {
        try {
          const data = await fs.readFile(thumbnailPath);
          resolve(`data:image/jpeg;base64,${data.toString("base64")}`);
        } catch (readError) {
          console.error(`Error reading video thumbnail file ${thumbnailPath}:`, readError);
          resolve(null);
        } finally {
          fs.unlink(thumbnailPath).catch((unlinkError) => {
            console.error(`Error unlinking video thumbnail file ${thumbnailPath}:`, unlinkError);
          });
        }
      })
      .on("error", (err) => {
        console.error(`FFmpeg error generating thumbnail for ${filePath}:`, err.message);
        resolve(null);
      })
      .screenshots({
        timestamps: ["00:00:01"],
        filename: tempFileName, // Use just the filename
        folder: thumbnailDir,    // Use the directory path
        size: "200x200",
      });
  });
}

app.use("/public", express.static(path.join(__dirname, "public")));
app.use(
  "/file",
  express.static(rootDir, {
    setHeaders: (res, filePath) => {
      const mimeType = mime.lookup(filePath) || "application/octet-stream";
      res.set("Content-Type", mimeType);
      if (mimeType.startsWith("image/") || mimeType.startsWith("video/")) {
        res.set("Content-Disposition", "inline");
      } else {
        res.set(
          "Content-Disposition",
          `attachment; filename="${path.basename(filePath)}"`
        );
      }
    },
  })
);

app.use((req, res, next) => {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(req.path);
  } catch (e) {
    // Handle malformed URI
    return res.status(400).send("Bad Request: Malformed URI");
  }

  const urlPathSegments = decodedPath
    .split("/")
    .filter((p) => p && p !== ".." && p !== "."); // Filter out empty, '.', and '..'

  // Construct the filesystem path and resolve it to an absolute, normalized path
  const tentativeSafePath = path.join(rootDir, ...urlPathSegments);
  const resolvedSafePath = path.resolve(tentativeSafePath);
  const resolvedRootDir = path.resolve(rootDir);

  // Security check: Ensure the resolved path is within the root directory
  if (!resolvedSafePath.startsWith(resolvedRootDir)) {
    return res
      .status(403)
      .send("Forbidden: Access outside of designated root directory.");
  }

  req.safePath = resolvedSafePath;

  // Construct relativePath for URL generation, always using forward slashes
  // e.g., "/", "/folder", "/folder/subfolder"
  req.relativePath = "/" + urlPathSegments.join("/");
  // If urlPathSegments is empty, join('/') results in "", so "/"+"" is "/". This is correct for root.

  next();
});

app.use("/file", (req, res, next) => {
  const filePath = path.join(rootDir, req.path);

  fs.stat(filePath)
    .then(() => {
      express.static(rootDir, {
        setHeaders: (res, filePath) => {
          const mimeType = mime.lookup(filePath) || "application/octet-stream";
          res.set("Content-Type", mimeType);
          if (mimeType.startsWith("image/") || mimeType.startsWith("video/")) {
            res.set("Content-Disposition", "inline");
          } else {
            res.set(
              "Content-Disposition",
              `attachment; filename="${path.basename(filePath)}"`
            );
          }
        },
      })(req, res, next);
    })
    .catch((err) => {
      if (err.code === "ENOENT") {
        return res.status(404).send("File not found");
      }
      next(err);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.code === "ENOENT") {
    return res.status(404).send("File not found");
  }
  console.error(err);
  res.status(500).send("Internal Server Error");
});

// New endpoint for generating thumbnails on demand
app.get("/thumbnail", async (req, res) => {
  const relativeFilePath = req.query.path;
  if (!relativeFilePath) {
    return res.status(400).send("Bad Request: Missing file path for thumbnail.");
  }

  let decodedFilePath;
  try {
    decodedFilePath = decodeURIComponent(relativeFilePath);
  } catch (e) {
    return res.status(400).send("Bad Request: Malformed file path for thumbnail.");
  }

  // Construct the full filesystem path and resolve it
  const tentativeFullPath = path.join(rootDir, decodedFilePath);
  const resolvedFullPath = path.resolve(tentativeFullPath);
  const resolvedRootDir = path.resolve(rootDir);

  // Security check: Ensure the resolved path is within the root directory
  if (!resolvedFullPath.startsWith(resolvedRootDir) || resolvedFullPath === resolvedRootDir) {
    // Also prevent operations on rootDir itself for thumbnails
    return res.status(403).send("Forbidden: Access outside of designated root directory or invalid path.");
  }

  try {
    const stats = await fs.stat(resolvedFullPath);
    if (stats.isDirectory()) {
      return res.status(400).send("Bad Request: Cannot generate thumbnail for a directory.");
    }

    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(decodedFilePath);
    const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(decodedFilePath);

    let thumbnailData = null;
    if (isImage) {
      thumbnailData = await generateImageThumbnail(resolvedFullPath);
    } else if (isVideo) {
      thumbnailData = await generateVideoThumbnail(resolvedFullPath);
    } else {
      return res.status(400).send("Bad Request: File type not supported for thumbnails.");
    }

    if (thumbnailData) {
      res.setHeader("Content-Type", "text/plain"); // The data is already a data URL string
      res.send(thumbnailData);
    } else {
      // If thumbnail generation returned null (e.g. error during generation)
      res.status(500).send("Error generating thumbnail.");
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).send("File not found for thumbnail generation.");
    }
    console.error(`Error processing thumbnail request for ${decodedFilePath}:`, err);
    res.status(500).send("Internal Server Error during thumbnail generation.");
  }
});

app.use("/", async (req, res, next) => {
  try {
    const currentPath = req.safePath;
    let files; // Declare files here to be accessible for template rendering
    try {
      const stats = await fs.stat(currentPath);
      if (!stats.isDirectory()) {
        return res.redirect(`/file${req.relativePath}`);
      }
      const items = await fs.readdir(currentPath, { withFileTypes: true });

      // Filter out hidden files/folders (those starting with .)
      const visibleItems = items.filter((item) => !item.name.startsWith("."));

      files = await Promise.all(
        // Assign to 'files' declared in the outer scope
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
            thumbnail: null, // Thumbnails will be loaded on demand by the client
            // Add a field for the client to request the thumbnail
            // This path should be relative to rootDir and URL-friendly
            // req.relativePath is like "/folder" or "/"
            // item.name is "file.jpg"
            // We need "folder/file.jpg" or "file.jpg" (if at root)
            thumbnailRequestPath: encodeURIComponent(
              path.posix.join(req.relativePath === "/" ? "" : req.relativePath, item.name)
                  .replace(/^\//, '') // Ensure no leading slash for query param
            )
          };
        })
      );

      // Sort files: folders first, then by name
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) {
          return -1;
        }
        if (!a.isDirectory && b.isDirectory) {
          return 1;
        }
        return a.name.localeCompare(b.name);
      });

    } catch (err) {
      if (err.code === "ENOENT") {
        return res.status(404).send("File not found");
      }
      throw err;
    }

    // Duplicated file processing block removed.
    // 'files' is now correctly populated in the try-catch block above
    // and is in scope for template rendering.
    const template = await fs.readFile(
      path.join(__dirname, "views", "index.html"),
      "utf8"
    );
    const parentUrlPath =
      req.relativePath === "/" ? "/" : path.posix.dirname(req.relativePath);

    const html = template
      .replace("{{HEADER}}", generateHeader(req.relativePath, parentUrlPath))
      .replace("{{FILES}}", generateFileList(files, req.relativePath));

    res.send(html);
  } catch (err) {
    next(err);
  }
});

function generateHeader(currentPath, parentUrl) {
  return `
    <div class="header">
      <a href="/" class="button">Home</a>
      ${
        currentPath !== "/"
          ? `<a href="${parentUrl}" class="button">Up</a>`
          : ""
      }
      <a href="#" class="button" id="refresh" onclick="location.reload();">Refresh</a>
    </div>
  `;
}

function generateFileList(files, currentWebPath) {
  // currentWebPath is req.relativePath (e.g., "/", "/folder", "/folder/subfolder")
  return files
    .map((file) => {
      const directoryLink = path.posix.join(currentWebPath, file.encodedName, "/");
      const fileLink = path.posix.join("/file", currentWebPath, file.encodedName);

      return `
    <div class="file-item"
         data-name="${file.name.toLowerCase()}"
         data-encoded-name="${file.encodedName}"
         data-is-directory="${file.isDirectory}"
         ${(file.isImage || file.isVideo) && !file.isDirectory ? `data-thumbnail-request-path="${file.thumbnailRequestPath}"` : ''}
         ${file.isImage && !file.isDirectory ? `data-is-image="true"` : ''}
         ${file.isVideo && !file.isDirectory ? `data-is-video="true"` : ''}>
      ${
        file.isDirectory
          ? `
        <a href="${directoryLink}">
          <div class="icon folder"></div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
              <span>${formatDate(file.created)}</span>
            </div>
          </div>
        </a>
      ` // End of isDirectory
          : file.isImage || file.isVideo // If it's an image or video (and not a directory)
          ? `
        <a href="${fileLink}" class="file-with-thumb"> 
          <div class="thumbnail-container">
            <div class="thumbnail">
            </div>
            ${file.isVideo ? '<div class="video-overlay">▶</div>' : ""}
          </div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
              <span>${formatSize(file.size)}</span>
              <span>${formatDate(file.created)}</span>
            </div>
          </div>
        </a>
      ` // End of isImage || isVideo
          : `
        <a href="${fileLink}" download> 
          <div class="icon file"></div> 
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
              <span>${formatSize(file.size)}</span>
              <span>${formatDate(file.created)}</span>
            </div>
          </div>
        </a>
      ` // End of regular file
      }
    </div>
  `;
    })
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
  const ip = getIP();
  const address = `http://${ip}:${port}/`;

  // ASCII Art and Welcome Message
  console.log("\x1b[36m%s\x1b[0m", `
███████╗██╗███╗   ██╗██████╗ ███████╗██████╗ ███████╗██╗
██╔════╝██║████╗  ██║██╔══██╗██╔════╝██╔══██╗██╔════╝██║
█████╗  ██║██╔██╗ ██║██║  ██║█████╗  ██████╔╝█████╗  ██║
██╔══╝  ██║██║╚██╗██║██║  ██║██╔══╝  ██╔══██╗██╔══╝  ██║
██║     ██║██║ ╚████║██████╔╝███████╗██║  ██║██║     ██║
╚═╝     ╚═╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝                                                                        
  `);
  console.log("\x1b[33m%s\x1b[0m", "             FinderFI by SamSeen Solutions");
  console.log("\n\x1b[1m\x1b[32m%s\x1b[0m", `  Server running at: ${address}`);
  console.log("\x1b[2m%s\x1b[0m", "  Scan the QR code below with your phone to access.");

  // QR Code
  const qrcode = require('qrcode-terminal');
  qrcode.generate(address, { small: true }, function (qr) {
    console.log(qr);
    console.log("\n\x1b[35m%s\x1b[0m", "=====================================================");
    console.log("\x1b[35m%s\x1b[0m", " Ensure your device is on the same Wi-Fi network!  ");
    console.log("\x1b[35m%s\x1b[0m", "=====================================================\n");
  });
});
