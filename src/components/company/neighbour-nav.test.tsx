import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { NeighbourNav } from "@/components/company/neighbour-nav";

const PREV = { id: 4, name: "㈜앞" };
const NEXT = { id: 6, name: "㈜뒤" };

describe("NeighbourNav", () => {
  test("walks the registry when no queue is given", () => {
    render(<NeighbourNav prev={PREV} next={NEXT} position={5} total={50} queue={null} />);

    expect(screen.getByRole("link", { name: "← ㈜앞" })).toHaveAttribute("href", "/companies/4");
    expect(screen.getByRole("link", { name: "㈜뒤 →" })).toHaveAttribute("href", "/companies/6");
    expect(screen.queryByText(/5\/50/)).not.toBeInTheDocument();
  });

  test("marks the ends of the registry instead of linking them", () => {
    render(<NeighbourNav prev={null} next={null} position={1} total={1} queue={null} />);

    expect(screen.getByText("← 처음")).toBeInTheDocument();
    expect(screen.getByText("마지막 →")).toBeInTheDocument();
  });

  test("names the queue with the place in it and carries the queue through both links", () => {
    render(<NeighbourNav prev={PREV} next={NEXT} position={2} total={12} queue="review" />);

    expect(screen.getByText("확인 필요 2/12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← ㈜앞" })).toHaveAttribute("href", "/companies/4?queue=review");
    expect(screen.getByRole("link", { name: "㈜뒤 →" })).toHaveAttribute("href", "/companies/6?queue=review");
  });

  test("labels the verification queue by its own name", () => {
    render(<NeighbourNav prev={null} next={NEXT} position={1} total={7} queue="verification" />);

    expect(screen.getByText("검토 필요 1/7")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "㈜뒤 →" })).toHaveAttribute("href", "/companies/6?queue=verification");
  });

  test("says the company is outside the queue when it has no place in it", () => {
    render(<NeighbourNav prev={null} next={null} position={null} total={12} queue="review" />);

    expect(screen.getByText("확인 필요 큐 밖")).toBeInTheDocument();
  });
});
