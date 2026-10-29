import * as Alchemy from "alchemy";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "BlobsMarketing",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    const site = yield* Cloudflare.Website.StaticSite("Website", {
      command: "node --run build",
      outdir: "dist",
      domain: stage === "prod" ? "blobs.satslab.xyz" : undefined,
      workersDev: stage !== "prod",
      assets: { notFoundHandling: "404-page" },
    });
    return { url: site.url };
  }),
);
