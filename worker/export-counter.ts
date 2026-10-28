import { DurableObject } from "cloudflare:workers";

// One instance holds the all-time export total. A Durable Object handles its
// calls one at a time, so concurrent increments never lose a count.
export class ExportCounter extends DurableObject {
  async increment() {
    const count = ((await this.ctx.storage.get<number>("count")) ?? 0) + 1;
    await this.ctx.storage.put("count", count);
    return count;
  }

  async count() {
    return (await this.ctx.storage.get<number>("count")) ?? 0;
  }
}
