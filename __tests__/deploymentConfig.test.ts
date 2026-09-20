import { expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
it("references an existing Windows application icon", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  expect(existsSync(pkg.build.win.icon)).toBe(true);
  expect([...readFileSync(pkg.build.win.icon).subarray(0,4)]).toEqual([0,0,1,0]);
});
