declare module 'shpjs' {
  export default function parseShapefile(input: ArrayBuffer): Promise<unknown>;
}
