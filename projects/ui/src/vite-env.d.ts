// ponytail: hand-rolled instead of `/// <reference types="vite/client" />` — ui has no vite dep of
// its own (consumers compile its source with theirs), and this is the only ambient type it needs.
declare module "*.svg" {
  const src: string
  export default src
}
