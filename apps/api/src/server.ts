import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

import s3Client, { ensureBucketExists } from "@video-transcoding/s3";
import app from "./app";

const PORT = process.env.PORT || 8000;

async function bootstrap() {
  await ensureBucketExists(s3Client);

  app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
  });
}

bootstrap();
