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

app.get("/deployment/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query(
      `select id, status, logs from deployments where id=$1`,
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Deployment not found" });
    }
    const deployment = result.rows[0];
    res.status(200).json(deployment)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Error fetching deployment" })
  }
})

app.listen(3000);

