import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type { DebugLogEntry } from "../contracts/debug-session.js";

const MAX_ENTRIES_PER_SESSION = 500;

interface DebugLogServerOptions {
  host?: string;
}

export class DebugLogServer {
  private server: Server | null = null;
  private port = 0;
  private readonly entriesBySession = new Map<string, DebugLogEntry[]>();

  constructor(private readonly options: DebugLogServerOptions = {}) {}

  async start(): Promise<number> {
    if (this.server) {
      return this.port;
    }

    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(0, this.options.host ?? "127.0.0.1", () => resolve());
      this.server!.once("error", reject);
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve debug log server port");
    }
    this.port = address.port;
    return this.port;
  }

  getPort(): number {
    return this.port;
  }

  getLogs(sessionId: string): DebugLogEntry[] {
    return [...(this.entriesBySession.get(sessionId) ?? [])];
  }

  appendLogs(sessionId: string, entries: DebugLogEntry[]): void {
    const existing = this.entriesBySession.get(sessionId) ?? [];
    const merged = [...existing, ...entries].slice(-MAX_ENTRIES_PER_SESSION);
    this.entriesBySession.set(sessionId, merged);
  }

  clearSession(sessionId: string): void {
    this.entriesBySession.delete(sessionId);
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close((error) => (error ? reject(error) : resolve()));
    });
    this.server = null;
    this.port = 0;
    this.entriesBySession.clear();
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders());
      response.end();
      return;
    }

    if (request.method !== "POST" || request.url !== "/debug-log") {
      response.writeHead(404, corsHeaders());
      response.end("Not found");
      return;
    }

    try {
      const body = await readBody(request);
      const payload = JSON.parse(body) as {
        sessionId?: string;
        hypothesisId?: string;
        location?: string;
        data?: unknown;
      };
      if (!payload.sessionId || !payload.location) {
        response.writeHead(400, corsHeaders());
        response.end("Missing sessionId or location");
        return;
      }

      const entry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        sessionId: payload.sessionId,
        ...(payload.hypothesisId ? { hypothesisId: payload.hypothesisId } : {}),
        location: payload.location,
        payload: payload.data ?? null,
      };
      this.appendLogs(payload.sessionId, [entry]);
      response.writeHead(204, corsHeaders());
      response.end();
    } catch {
      response.writeHead(400, corsHeaders());
      response.end("Invalid debug log payload");
    }
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

let sharedDebugLogServer: DebugLogServer | null = null;

export async function getSharedDebugLogServer(): Promise<DebugLogServer> {
  if (!sharedDebugLogServer) {
    sharedDebugLogServer = new DebugLogServer();
    await sharedDebugLogServer.start();
  }
  return sharedDebugLogServer;
}
