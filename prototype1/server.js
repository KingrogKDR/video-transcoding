const express = require("express")
const multer = require("multer")
const path = require("path")
const fs = require("fs")

const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, "uploads");

fs.mkdirSync(uploadDir, {recursive: true});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

const app = express()

app.get("/", (req, res)=>{
    res.json({message:"server is up!!"})
})

app.post("/upload",upload.single("file"),(req, res)=>{
    if(!req.file) return res.status(400).json({error:"No file uploaded"});
    res.json({
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
    })
})

app.listen(PORT,()=>{
    console.log("Server has started!")
})


/*
Prototype 1:
- In this we leverage multer to upload our file
- This file is uploaded to uploads folder in the root dir of the server
- File can be uploaded by curl or postman
- curl -> curl -F "file=@/path/to/video.mp4" http://localhost:3000/upload (-F -> multipart/form-data)
- POSTMAN -> POST req to server (form-data, key="file" as in upload.single("file"), and type=File and not Text)
*/