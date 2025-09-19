const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

const app = express();

app.get("/", (req, res) => {
  res.json({ message: "Server is up!" });
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const inputPath = req.file.path;
  const outputFilename = `${Date.now()}-720p.mp4`;
  const outputPath = path.join(outputDir, outputFilename);

  ffmpeg(inputPath)
    .outputOptions([
        "-vf scale=-2:720", // -vf = video filter. "scale=-2:720" resizes video so height = 720px, width is auto (-2 keeps even numbers for codec compatibility).
        "-c:v libx264",     // -c:v = video codec. "libx264" = H.264 encoder (widely supported, good quality).
        "-preset fast",     // Preset = tradeoff between encoding speed vs compression efficiency. Options: ultrafast, superfast, veryfast, faster, fast, medium (default), slow, slower, veryslow.
        "-crf 23",          // Constant Rate Factor (0–51). Lower = better quality, bigger files. 23 is default, good balance. Typical range: 18–28.
        "-c:a aac",         // -c:a = audio codec. "aac" = Advanced Audio Codec (modern, widely supported).
        "-b:a 128k",        // -b:a = audio bitrate. 128 kbps = standard quality for stereo audio.
    ])
    .save(outputPath)
    .on("start", (cmd) => console.log("FFmpeg started:", cmd))
    .on("progress", (progress) => {
      console.log(`Processing: ${progress.percent ? progress.percent.toFixed(2) : 0}% done`);
    })
    .on("end", () => {
      console.log("Transcoding finished:", outputPath);
      res.json({
        original: req.file.filename,
        transcoded: outputFilename,
        path: outputPath,
      });
    })
    .on("error", (err) => {
      console.error("FFmpeg error:", err);
      res.status(500).json({ error: "Transcoding failed" });
    });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

/*
Prototype 2:
- First Video is uploaded to the uploads folder
- Then we use ffmpeg to convert it based on certain parameters
- Then that is stored in output path
*/