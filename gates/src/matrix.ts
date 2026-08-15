#!/usr/bin/env bun
import { GATES } from "./registry";
import { renderGateMatrix } from "./report";

/**
 * Writes docs/gate-matrix.md from the registry. Run by `make gate-matrix`, and
 * checked in CI — a matrix that disagrees with the code it documents is worse
 * than no matrix, because it is believed.
 */
const target = Bun.argv[2] ?? "docs/gate-matrix.md";
await Bun.write(target, renderGateMatrix(GATES));
console.log(`wrote ${target}`);
