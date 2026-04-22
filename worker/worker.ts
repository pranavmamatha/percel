import { Worker } from "bullmq"
import { pool } from "../api/db.ts"

import { exec } from "child_process"
import util from "util"

const execAsync = util.promisify(exec);

const worker = new Worker(
  "deployment",
  async job => {
    try {
      const { id, repoUrl, buildCommand } = job.data;

      console.log("Processing Job", job.id)

      await pool.query(
        "update deployments set status=$1 where id=$2",
        ["running", id]
      )

      const folder = `./temp/${id}`
      await execAsync(`mkdir -p ${folder}`);

      await execAsync(`git clone ${repoUrl} ${folder}`);
      await execAsync(`cd ${folder} && bun install`);
      await execAsync(`cd ${folder} && ${buildCommand}`)

      await pool.query(
        "update deployments set status=$1 where id=$2",
        ["success", id]
      )
      return { success: true };
    }
    catch (err) {
      console.error("Build failed", err);
      throw err;
    }
  },

  {
    connection: {
      host: "localhost",
      port: 6379
    }
  }
)


worker.on("completed", (job) => {
  console.log(`Job ${job?.id} completed`);
})

worker.on("failed", async (job, err) => {
  console.log(`job ${job?.id} failed:`, err.message)

  await pool.query(
    "update deployments set status=$1 where id=$2",
    ["failed", job?.data.id]
  )
});
