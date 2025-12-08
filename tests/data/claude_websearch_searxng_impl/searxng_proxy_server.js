import express from "express";
import fetch from "node-fetch";
import SearxNG from "searxng-ts";

const app = express();
app.use(express.json());

const searx = new SearxNG({
  baseURL: "http://searxng.search.svc.cluster.local:8080",
  format: "json"
});

app.post("/v1/chat/completions", async (req, res) => {
  const messages = req.body.messages;
  const last = messages[messages.length - 1];

  const toolCall = last.tool_calls?.[0];
  if (!toolCall) {
    return res.status(400).json({ error: "No tool call found" });
  }

  const toolCallId = toolCall.id;
  const query = toolCall.function.arguments.query;

  let search;
  try {
    search = await searx.search(query);
  } catch (e) {
    return res.json({
      choices: [
        {
          message: {
            role: "tool",
            content: [
              {
                type: "tool_result",
                tool_call_id: toolCallId,
                result: { error: "search_failed", details: e.message }
              }
            ]
          }
        }
      ]
    });
  }

  const results = (search.results || []).slice(0, 5).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content
  }));

  res.json({
    choices: [
      {
        message: {
          role: "tool",
          content: [
            {
              type: "tool_result",
              tool_call_id: toolCallId,
              result: {
                query,
                results
              }
            }
          ]
        }
      }
    ]
  });
});

app.listen(3000, () =>
  console.log("SearxNG WebSearch Proxy running on port 3000")
);
