// Vite's `?url` suffix imports a file as its emitted asset URL.
declare module "*?url" {
  const src: string;
  export default src;
}
