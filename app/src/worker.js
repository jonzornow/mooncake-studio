import Module from "manifold-3d";
import { makeBuilder } from "./geometry.js";
let ready;
onmessage = async ({ data }) => {
  try {
    ready ??= Module({
      wasmBinary: data.wasmBinary,
      locateFile: () => data.wasmURL,
    }).then((m) => {
      m.setup();
      return makeBuilder(m);
    });
    const build = await ready;
    const result = build(data.params, data.paths);
    postMessage({ id: data.id, result });
  } catch (e) {
    postMessage({ id: data.id, error: e.message || String(e) });
  }
};
