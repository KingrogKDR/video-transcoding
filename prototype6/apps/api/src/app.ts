import express from "express";
import uploadRoutes from "./routes/upload.route";
import authRoutes from "./routes/auth.route";
import { authenticate } from "./middleware/auth.middleware";

const app = express();

app.use(express.json());

app.get("/", (_, res) => {
  res.json({ message: "Server is up!" });
});

// Auth routes (public)
app.use("/auth", authRoutes);

// Protected routes
app.use("/upload", authenticate, uploadRoutes);

export default app;

