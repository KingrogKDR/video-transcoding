const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const s3 = require("./s3Client")
const { PutObjectCommand } = require("@aws-sdk/client-s3");

const PORT = process.env.PORT || 3000;
const BUCKET = "videos";


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
      "-vf scale=-2:720",
      "-c:v libx264",
      "-preset fast",
      "-crf 23",
      "-c:a aac",
      "-b:a 128k",
    ])
    .save(outputPath)
    .on("end", async () => {
      try {
        // Upload to MinIO
        const fileStream = fs.createReadStream(outputPath);

        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: outputFilename,
            Body: fileStream,
            ContentType: "video/mp4",
          })
        );

        console.log("Uploaded to MinIO:", outputFilename);
        res.json({
          original: req.file.filename,
          transcoded: outputFilename,
          url: `http://localhost:9000/${BUCKET}/${outputFilename}`,
        });
      } catch (err) {
        console.error("Upload failed:", err);
        res.status(500).json({ error: "Upload to MinIO failed" });
      }
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
Prototype 3:
- In this prototype, we put the transcoded video into an object store
- For local testing we are using Minio which is totally compatible with s3
- Hence, we have used AWS libraries 
*/