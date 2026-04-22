import { Worker } from "bullmq"
import { pool } from "../api/db.ts"

const worker = new Worker(
  "deployment",
  async job => {
    console.log("here2")
    console.log("Processing Job", job.id)

    const { id, repoUrl, buildCommand } = job.data;

    await pool.query(
      "update deployments set status=$1 where id=$2",
      ["running", id]
    )

    await new Promise((res) => setTimeout(res, 5000))
    console.log(job.id, id, job.data.id)
    await pool.query(
      "update deployments set status=$1 where id=$2",
      ["success", id]
    )
    return { success: true }
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
