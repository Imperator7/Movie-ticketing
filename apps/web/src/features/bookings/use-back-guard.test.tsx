import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBackNavigationGuard } from "./use-back-guard";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("useBackNavigationGuard", () => {
  it("does nothing when disabled", () => {
    const push = vi.spyOn(window.history, "pushState");
    const onBlocked = vi.fn();
    renderHook(() => {
      useBackNavigationGuard(false, onBlocked);
    });
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(push).not.toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("pushes a sentinel entry and blocks the back button", () => {
    const push = vi.spyOn(window.history, "pushState");
    const onBlocked = vi.fn();
    renderHook(() => {
      useBackNavigationGuard(true, onBlocked);
    });
    expect(push).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onBlocked).toHaveBeenCalledWith({ type: "back" });
    // The sentinel is restored so the user stays on the page.
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("blocks in-app link clicks and reports the target", async () => {
    const onBlocked = vi.fn();
    renderHook(() => {
      useBackNavigationGuard(true, onBlocked);
    });
    const link = document.createElement("a");
    link.href = "/th/movies";
    link.textContent = "Movies";
    document.body.append(link);

    await userEvent.click(link);
    expect(onBlocked).toHaveBeenCalledWith({ type: "link", href: "/th/movies" });
  });

  it("lets external links, new-tab links and modified clicks through", async () => {
    const onBlocked = vi.fn();
    renderHook(() => {
      useBackNavigationGuard(true, onBlocked);
    });
    const external = document.createElement("a");
    external.href = "https://www.themoviedb.org/";
    external.addEventListener("click", (e) => {
      e.preventDefault();
    });
    const newTab = document.createElement("a");
    newTab.href = "/th/movies";
    newTab.target = "_blank";
    newTab.addEventListener("click", (e) => {
      e.preventDefault();
    });
    document.body.append(external, newTab);

    await userEvent.click(external);
    await userEvent.click(newTab);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("stops guarding after unmount", () => {
    const onBlocked = vi.fn();
    const { unmount } = renderHook(() => {
      useBackNavigationGuard(true, onBlocked);
    });
    unmount();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onBlocked).not.toHaveBeenCalled();
  });
});
