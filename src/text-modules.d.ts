// wrangler (rules: Text) and vitest (vitest.config.ts) both load *.client.js as its source text.
declare module "*.client.js" {
  const source: string;
  export default source;
}
