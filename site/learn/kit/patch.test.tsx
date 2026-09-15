// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { hasPatch, patchIds } from "../patches";
import { Patch } from "./Patch";

/*
 * A lesson loads its own patch, and nobody else's (02c).
 *
 * The registry is a table of `() => import()`, so the id a lesson writes is
 * answered from a list of names and the patch itself arrives a frame later.
 * That is a promise about the *bundle*, which no test in jsdom can see - what
 * this file holds is the behaviour the promise costs: the frame is there before
 * the patch is, an unregistered id never becomes a fetch, and the widget that
 * replaces the frame is the one the lesson asked for with the knobs it chose.
 */

afterEach(cleanup);

describe("a lesson loads its own patch", () => {
  it("answers an id without loading anything", () => {
    expect(hasPatch("sound/tone")).toBe(true);
    expect(hasPatch("sound/not-a-patch")).toBe(false);
    expect(patchIds).toContain("voice");
  });

  it("draws its frame first, then the widget", async () => {
    const { container } = render(
      <Patch id="sound/tone" show={["frequency"]} />,
    );

    // The first render, synchronously: a frame of the widget's own size, and
    // no `data-patch` on it - that attribute means "there is a Play button
    // here", and `check:sound` reads it that way.
    expect(container.querySelector("[data-patch-loading]")).not.toBeNull();
    expect(container.querySelector("figure[data-patch]")).toBeNull();

    await waitFor(() =>
      expect(
        container.querySelector('figure[data-patch="sound/tone"]'),
      ).not.toBeNull(),
    );

    expect(container.querySelector("[data-patch-loading]")).toBeNull();
    // The lesson's `show` still picks the knobs, out of the manifest that
    // arrived rather than one that was already in the page.
    const controls = container.querySelectorAll("[data-control]");
    expect(controls).toHaveLength(1);
    expect(controls[0].getAttribute("data-control")).toBe("frequency");
  });

  it("says so when no patch is registered under the id", () => {
    const { container } = render(<Patch id="sound/not-a-patch" />);

    expect(screen.getByText(/No patch registered/)).toBeTruthy();
    expect(container.querySelector("[data-patch-loading]")).toBeNull();
  });
});
