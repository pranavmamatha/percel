import express from "express";
import { pool } from "./db.ts"
const app = express();
app.use(express.json())

app.post("/deploy", async (req, res) => {
  try {
    const { repoUrl, buildCommand } = req.body;
    if (!buildCommand || !repoUrl) {
      return res.status(400).json({ error: "missing fields" })
    }
    const result = await pool.query(
      `insert into deployments (repo_url, build_command)
       values ($1, $2)
       returning *`,
      [repoUrl, buildCommand]

    );
    res.status(202).json({ status: "stored", deployment: result.rows[0] })

  } catch (err) {
    console.error(err)
    res.status(500).json({ status: "db failed" })
  }
});

app.listen(3000);

