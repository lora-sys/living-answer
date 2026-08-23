import { describe, expect, it } from "vite-plus/test";

import { APP_NAME, PRODUCT_TAGLINE, READY_MESSAGE, STACK_LABEL } from "./app-info";

describe("app information", () => {
  it("keeps the environment-ready page content explicit", () => {
    expect(APP_NAME).toBe("Living Answer");
    expect(PRODUCT_TAGLINE).toContain("知乎回答");
    expect(READY_MESSAGE).toBe("开发环境已准备完成");
    expect(STACK_LABEL).toBe("TanStack Start · Tailwind CSS · Vite+");
  });
});
