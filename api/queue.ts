import { Queue } from "bullmq";

export const deployQueue = new Queue("deployment", {
  connection: {
    host: "localhost",
    port: 6379
  }
});
