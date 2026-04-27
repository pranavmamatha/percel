import { Worker } from "bullmq";
import { Job } from "bullmq"
import { pool } from "./../api/db.ts"
import { exec } from "child_process"
import { promisify } from "util";
import { uploadDirectory } from "./services/storage.ts"

const asyncExec = promisify(exec)

const repoNameExtractor = (url: string) => {
  const myUrl = new URL(url);
  const pathSegment = myUrl.pathname.split("/").filter(Boolean);
  let repoName = pathSegment[1]
  if (repoName?.endsWith(".git")) {
    repoName = repoName.replace(".git", "")
  }
  return repoName
}


const runCommand = async (cmd: string) => {
  try {
    const { stdout, stderr } = await asyncExec(cmd);
    if (stdout) console.log(stdout);
    if (stderr) console.warn(stderr);
    return { success: true }
  } catch (err) {
    console.error("Command Failed: ");
    console.error(err);
    throw err;
  }
}

const deployment = async (job: Job) => {
  try {
    console.log("Processing deployment:", job.id)
    const { id, repoUrl, buildCommand } = job.data;
    await pool.query(
      "update deployments set status=$1 where id=$2",
      ["running", id]
    )
    const folder = `./temp/${id}`
    const repoName = repoNameExtractor(repoUrl);
    const fullPath = folder + "/" + repoName

    await runCommand(`rm -rf ${folder}`);
    await runCommand(`mkdir -p ${folder}`)
    await runCommand(`git clone ${repoUrl} ${fullPath} `)

    const dockerCommand = (`
      docker run --rm \
        --memory="500m" --cpus="0.5" \
        -v ${process.cwd()}/${fullPath}:/app \
        -w /app \
        deploy-runner \
        sh -c "npm install && ${buildCommand}"
    `)

    await Promise.race([
      runCommand(dockerCommand),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timeout"))
        }, 5 * 60 * 1000)
      })
    ])

    await uploadDirectory(fullPath + "/dist", id)

    await runCommand(`rm -rf ${folder}`)

    await pool.query(
      "update deployments set status=$1 where id=$2",
      ["success", id]
    )

    return { success: true }

  } catch (err) {
    console.error("Build failed: ", err)
    throw err
  }
}


const worker = new Worker(
  "deployment",

  async job => {
    return deployment(job);
  },

  {
    connection: {
      host: "localhost",
      port: 6379
    }
  }
)


worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`)
})

worker.on("failed", async (job, err) => {
  console.log(`Job ${job?.id} failed:`, err)

  await pool.query(
    "update deployments set status=$1 where id=$2",
    ["failed", job?.id]
  )
})
