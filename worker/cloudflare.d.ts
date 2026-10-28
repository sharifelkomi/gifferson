// The slice of the Workers runtime types this worker uses.
declare module "cloudflare:workers" {
  interface DurableObjectState {
    storage: {
      get<T>(key: string): Promise<T | undefined>;
      put(key: string, value: unknown): Promise<void>;
    };
  }

  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}
