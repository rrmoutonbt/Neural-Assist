import "@testing-library/jest-dom";

// jsdom (as of jest-environment-jsdom 29) does not expose the WHATWG Fetch
// globals that Node 18+ provides. Ship a minimal Response polyfill so tests
// can construct fake responses the same way production code sees them.
if (typeof (globalThis as any).Response === "undefined") {
  class MiniResponse {
    readonly status: number;
    readonly ok: boolean;
    private readonly _body: string;
    readonly headers: { get: (name: string) => string | null };
    constructor(body: BodyInit | null = null, init: ResponseInit = {}) {
      this._body = typeof body === "string" ? body : body == null ? "" : String(body);
      this.status = init.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      const headerMap = new Map<string, string>();
      const initHeaders = init.headers as Record<string, string> | undefined;
      if (initHeaders) {
        for (const [k, v] of Object.entries(initHeaders)) {
          headerMap.set(k.toLowerCase(), v);
        }
      }
      this.headers = { get: (name) => headerMap.get(name.toLowerCase()) ?? null };
    }
    async text(): Promise<string> { return this._body; }
    async json(): Promise<unknown> { return JSON.parse(this._body); }
  }
  (globalThis as any).Response = MiniResponse as unknown as typeof Response;
}
