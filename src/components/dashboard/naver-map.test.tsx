import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { NaverMap } from "@/components/dashboard/naver-map";
import type { MapPin } from "@/lib/services/mapPins";

const PINS: MapPin[] = [
  {
    companyId: 1,
    name: "크립토랩",
    latitude: 37.4602,
    longitude: 126.9527,
    radius: 20,
    exact: false,
    state: "review",
    subscribers: 61,
    note: "도로 단위 · 국민연금 주소",
  },
];

describe("NaverMap", () => {
  test("asks for the client id rather than loading a blank map", () => {
    render(<NaverMap clientId="" pins={PINS} unplaced={[]} />);

    expect(screen.getByText(/NEXT_PUBLIC_NCP_MAP_CLIENT_ID/)).toBeInTheDocument();
  });

  test("holds a container for the map when the key is present", () => {
    const { container } = render(<NaverMap clientId="abc" pins={PINS} unplaced={[]} />);

    expect(container.querySelector("[data-testid='naver-map-canvas']")).not.toBeNull();
  });

  test("counts how many pins are only accurate to the road", () => {
    render(<NaverMap clientId="abc" pins={PINS} unplaced={[]} />);

    expect(screen.getByText(/도로 단위 1곳/)).toBeInTheDocument();
  });

  test("names the companies it could not place instead of dropping them", () => {
    render(<NaverMap clientId="abc" pins={PINS} unplaced={["SDT", "휴미템"]} />);

    expect(screen.getByText(/좌표 없음/)).toHaveTextContent("SDT, 휴미템");
  });

  test("says nothing has been geocoded yet when there are no pins at all", () => {
    render(<NaverMap clientId="abc" pins={[]} unplaced={[]} />);

    expect(screen.getByText(/geocode-companies/)).toBeInTheDocument();
  });
});

type FakeMarker = { destroyed: boolean; listeners: number };

function stubNaverMaps() {
  const script = document.createElement("script");
  script.id = "ncp-maps-v3";
  document.head.appendChild(script);

  const markers: FakeMarker[] = [];
  const maps = { destroyed: false, listeners: 1 };

  (window as unknown as { naver: unknown }).naver = {
    maps: {
      Map: class {
        destroyed = false;
        constructor() {
          Object.assign(maps, this);
        }
        destroy() {
          maps.destroyed = true;
        }
      },
      LatLng: class {},
      Point: class {},
      Marker: class {
        entry: FakeMarker = { destroyed: false, listeners: 0 };
        constructor() {
          markers.push(this.entry);
        }
        setMap(map: unknown) {
          if (map === null) this.entry.destroyed = true;
        }
      },
      Event: {
        addListener: () => {},
        clearInstanceListeners: (target: { entry?: FakeMarker }) => {
          if (target.entry) target.entry.listeners = 0;
          else maps.listeners = 0;
        },
      },
    },
  };

  return { markers, maps };
}

describe("NaverMap cleanup", () => {
  afterEach(() => {
    document.getElementById("ncp-maps-v3")?.remove();
    delete (window as unknown as { naver?: unknown }).naver;
  });

  test("releases every marker when the panel goes away", async () => {
    const fake = stubNaverMaps();
    const { unmount } = render(<NaverMap clientId="abc" pins={PINS} unplaced={[]} />);
    await waitFor(() => expect(fake.markers).toHaveLength(1));

    unmount();

    expect(fake.markers.every((marker) => marker.destroyed)).toBe(true);
  });

  test("destroys the map instance so its listeners do not outlive the panel", async () => {
    const fake = stubNaverMaps();
    const { unmount } = render(<NaverMap clientId="abc" pins={PINS} unplaced={[]} />);
    await waitFor(() => expect(fake.markers).toHaveLength(1));

    unmount();

    expect(fake.maps.destroyed).toBe(true);
    expect(fake.maps.listeners).toBe(0);
  });

  test("does not stack a second map when the pins change", async () => {
    const fake = stubNaverMaps();
    const { rerender } = render(<NaverMap clientId="abc" pins={PINS} unplaced={[]} />);
    await waitFor(() => expect(fake.markers).toHaveLength(1));

    rerender(<NaverMap clientId="abc" pins={[{ ...PINS[0], companyId: 2, name: "딥로딩" }]} unplaced={[]} />);
    await waitFor(() => expect(fake.markers).toHaveLength(2));

    expect(fake.markers[0].destroyed).toBe(true);
  });
});
