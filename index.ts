import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import aiRoutes from "./src/routes/aiRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.urlencoded());
app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());

app.get("/", (_req, _res) => {
  return _res.send("Server started");
});

app.use("/api", aiRoutes);

app.listen(PORT, () => {
  console.log(`server started and running at http://localhost:${PORT}`);
});
