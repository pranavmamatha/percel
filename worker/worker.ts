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
    return stdout + "\n" + stderr;
  } catch (err: any) {
    return (
      (err?.stdout || "") + "\n" +
      (err?.stderr || "") + "\n" +
      (err.message)
    )
  }
}

const deployment = async (job: Job) => {

  const { id, repoUrl, buildCommand, outputDir } = job.data;
  let logs = "";
  const folder = `./temp/${id}`
  const repoName = repoNameExtractor(repoUrl);
  const fullPath = folder + "/" + repoName

  try {
    console.log("Processing deployment:", job.id)
    await pool.query(
      "update deployments set status=$1 where id=$2",
      ["running", id]
    )

    logs += await runCommand(`rm -rf ${folder}`);
    logs += await runCommand(`mkdir -p ${folder}`)
    logs += await runCommand(`git clone ${repoUrl} ${fullPath} `)

    const dockerCommand = (`
      docker run --rm \
        --memory="500m" --cpus="0.5" \
        -v ${process.cwd()}/${fullPath}:/app \
        -w /app \
        deploy-runner \
        sh -c "npm install && ${buildCommand}"
    `)

    const buildLogs = await Promise.race([
      runCommand(dockerCommand),
      new Promise<string>((_, reject) => {
        setTimeout(async () => {
          await runCommand(`docker kill -f deploy-runner`)
          reject(new Error("Build Timeout"))
        }, 5 * 60 * 1000)
      })
    ])

    logs += buildLogs;

    logs += await runCommand(`echo "Uploading build..."`);
    await uploadDirectory(fullPath + `${outputDir}`, id)

    await pool.query(
      "update deployments set status=$1, logs=$2 where id=$3",
      ["success", logs, id]
    )

    return { success: true }

  } catch (err: any) {
    console.error("Build failed:", err);

    logs += "\nError: \n" + (err?.message || "Unknown Error")
    await pool.query(
      "update deployments set status=$1, logs=$2 where id=$3",
      ["failed", logs, id]
    )
    throw err;
  } finally {
    await runCommand(`rm -rf ${folder}`);
    await runCommand(`docker rm -f ${id}`);
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
})
