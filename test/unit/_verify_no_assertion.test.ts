import { test } from "vitest";

test("verify sonarjs/assertions-in-tests catches this", () => {
  const value = 1 + 1;
  void value;
});
