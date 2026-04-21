import express from "express";
const app = express();
app.use(express.json())

app.post("/deploy", (req, res) => {
  try {
    const data = req.body;
    const repoUrl = data.repoUrl
    const buildCommand = data.buildCommand
    if (buildCommand && repoUrl) {
      res.send({ status: "recived" })
    } else {
      res.send({ status: "did not recive" })
    }
  } catch {
    res.send({ status: "failed" })
  }
})

app.listen(3000);

