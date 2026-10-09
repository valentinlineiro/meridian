// wrangler (rules: Text) and vitest (vitest.config.ts) both load *.client.js and *.client.css as their source text.
declare module "*.client.js" {
  const source: string;
  export default source;
}
declare module "*.client.css" {
  const source: string;
  export default source;
}
