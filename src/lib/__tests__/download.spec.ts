import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { triggerDownload } from "../utils/download";

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  document.body.innerHTML = "";
});

describe("triggerDownload", () => {
  it("creates an anchor and revokes the blob", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");
    const appendSpy = vi.spyOn(document.body, "append");

    triggerDownload("file.txt", "content", "text/plain");

    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(document.querySelector("a[href='blob:mock']")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectUrl;
  URL.revokeObjectURL = originalRevoke;
});
