import express from "express";
import { pool } from "./db.ts"
import { deployQueue } from "./queue.ts";
const app = express();
app.use(express.json())

app.post("/deploy", async (req, res) => {
  try {
    const { repoUrl, buildCommand, outputDir = "/dist" } = req.body;
    if (!buildCommand || !repoUrl) {
      return res.status(400).json({ error: "missing fields" })
    }
    const result = await pool.query(
      `insert into deployments (repo_url, build_command, outputDir)
       values ($1, $2, $3)
       returning *`,
      [repoUrl, buildCommand, outputDir]

    );

    const deployment = result.rows[0];

    await deployQueue.add("deploy-job", {
      id: deployment.id,
      repoUrl,
      buildCommand,
      outputDir
    }, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000
      }
    })

    res.status(202).json({ status: "queued", deployment: result.rows[0] })

  } catch (err) {
    console.error(err)
    res.status(500).json({ status: "db failed" })
  }
});

app.listen(3000);

