import { docs, meta } from "@/.source";
import { loader } from "fumadocs-core/source";
import { createMDXSource } from "fumadocs-mdx";

export const { getPage, getPages, pageTree } = loader({
  baseUrl: "/docs",
  source: createMDXSource(docs, meta),
});
