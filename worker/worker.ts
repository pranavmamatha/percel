import { Worker } from "bullmq"
import { pool } from "../api/db.ts"

import { exec } from "child_process"
import util from "util"

const execAsync = util.promisify(exec)

const runCommand = async (cmd: string) => {
  try {
    const { stdout, stderr } = await execAsync(cmd);

    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr)

    return { success: true }
  } catch (err) {
    console.error("Command failed:", err);
    throw err;
  }
}

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


      const url = new URL(repoUrl);
      const pathSegments = url.pathname.split('/').filter(Boolean);

      let repoName = pathSegments[1];

      if (repoName?.endsWith('.git')) {
        repoName = repoName.replace('.git', '');
      }


      const folder = `./temp/${id}`
      const container = `deploy-${id}`;
      const projectPath = `${folder}/${repoName}`;
      await runCommand(`mkdir -p ${folder}`);

      await runCommand(`git clone ${repoUrl} ${folder}`)

      await runCommand(`
        docker run --rm \
          -v ${process.cwd()}/${folder}:/app \
          -w /app/${repoName} \
          deploy-runner \
          sh -c "npm install && ${buildCommand}"
      `);


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
