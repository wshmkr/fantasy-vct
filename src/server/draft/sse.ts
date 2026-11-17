import type { Request, Response } from "express";

const HEARTBEAT_MS = 25_000;

const streamsByStage = new Map<number, Set<Response>>();

export function openDraftStream(
  stageId: number,
  req: Request,
  res: Response,
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  const streams = streamsByStage.get(stageId) ?? new Set();
  streams.add(res);
  streamsByStage.set(stageId, streams);

  const heartbeat = setInterval(
    () => res.write(": heartbeat\n\n"),
    HEARTBEAT_MS,
  );
  req.on("close", () => {
    clearInterval(heartbeat);
    streams.delete(res);
  });
}

export function notifyDraftChanged(stageId: number): void {
  for (const res of streamsByStage.get(stageId) ?? []) {
    // EventSource drops events without a data line, so send an empty one.
    res.write("event: changed\ndata: \n\n");
  }
}
