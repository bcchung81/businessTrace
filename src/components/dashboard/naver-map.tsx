"use client";

import { useEffect, useRef, useState } from "react";
import type { MapPin } from "@/lib/services/mapPins";

const SCRIPT_ID = "ncp-maps-v3";
const CENTER = { lat: 36.5, lng: 127.9 };
const ZOOM = 7;

const STATE_COLOR: Record<MapPin["state"], string> = {
  verified: "var(--verified)",
  review: "var(--review)",
  risk: "var(--risk)",
};

const number = new Intl.NumberFormat("ko-KR");

/**
 * 네이버 지도 v3 스크립트를 한 번만 붙인다. 인증 파라미터는 ncpClientId 가 아니라 ncpKeyId 다 — v3 에서 바뀌었다.
 * 실패한 태그는 지운다. 남겨두면 다음 시도가 곧바로 성공으로 착각하고 빈 지도를 그린다.
 */
function loadMaps(clientId: string) {
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("네이버 지도 스크립트를 불러오지 못했습니다."));
    };
    document.head.appendChild(script);
  });
}

type NaverMap = { destroy: () => void };

type NaverMarker = { setMap: (map: unknown) => void };

type NaverMaps = {
  Map: new (element: HTMLElement, options: unknown) => NaverMap;
  LatLng: new (lat: number, lng: number) => unknown;
  Marker: new (options: unknown) => NaverMarker;
  Point: new (x: number, y: number) => unknown;
  Event: {
    addListener: (target: unknown, event: string, handler: () => void) => void;
    clearInstanceListeners: (target: unknown) => void;
  };
};

function markerHtml(pin: MapPin) {
  const color = STATE_COLOR[pin.state];
  const border = pin.exact ? `2px solid ${color}` : `2px dashed ${color}`;

  return `<div style="width:${pin.radius * 2}px;height:${pin.radius * 2}px;border-radius:9999px;
    background:color-mix(in srgb, ${color} 22%, transparent);border:${border};
    display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;
    color:${color};white-space:nowrap">${pin.subscribers}</div>`;
}

/**
 * 기업 좌표를 네이버 지도에 얹는다.
 * 번지가 없는 주소는 도로 대표점이라 실선 대신 점선으로 그린다 — 같은 점처럼 보이면 없는 정밀도를 믿게 된다.
 * 지도·마커는 언마운트에서 반드시 되돌린다. 네이버 지도는 window 에 리스너를 걸어 두어 방치하면 인스턴스가 그대로 쌓인다.
 */
export function NaverMap({
  clientId,
  pins,
  unplaced,
}: {
  clientId: string;
  pins: MapPin[];
  unplaced: string[];
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<MapPin | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || pins.length === 0) return;
    let cancelled = false;
    let release: (() => void) | null = null;

    loadMaps(clientId)
      .then(() => {
        const maps = (window as unknown as { naver?: { maps?: NaverMaps } }).naver?.maps;
        if (!maps || !canvas.current) return;

        const map = new maps.Map(canvas.current, {
          center: new maps.LatLng(CENTER.lat, CENTER.lng),
          zoom: ZOOM,
          mapDataControl: false,
          scaleControl: false,
        });

        const markers = pins.map((pin) => {
          const marker = new maps.Marker({
            map,
            position: new maps.LatLng(pin.latitude, pin.longitude),
            title: pin.name,
            icon: { content: markerHtml(pin), anchor: new maps.Point(pin.radius, pin.radius) },
          });
          maps.Event.addListener(marker, "mouseover", () => setActive(pin));
          return marker;
        });

        release = () => {
          for (const marker of markers) {
            maps.Event.clearInstanceListeners(marker);
            marker.setMap(null);
          }
          maps.Event.clearInstanceListeners(map);
          map.destroy();
        };

        if (cancelled) release();
      })
      .catch((error: Error) => {
        if (!cancelled) setFailed(error.message);
      });

    return () => {
      cancelled = true;
      release?.();
      release = null;
    };
  }, [clientId, pins]);

  if (!clientId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-[13px] font-semibold">네이버 지도 키가 없습니다.</p>
        <p className="text-[12px] text-muted-foreground">
          NCP 콘솔에서 Maps Application 을 만들고 NEXT_PUBLIC_NCP_MAP_CLIENT_ID 를 넣으세요.
        </p>
      </div>
    );
  }

  if (pins.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-[13px] font-semibold">좌표가 아직 없습니다.</p>
        <p className="text-[12px] text-muted-foreground">
          npx tsx scripts/geocode-companies.ts 로 주소를 좌표로 옮기세요.
        </p>
      </div>
    );
  }

  const approximate = pins.filter((pin) => !pin.exact).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background">
        <div ref={canvas} data-testid="naver-map-canvas" className="h-full w-full" />
      </div>

      <p
        role="status"
        aria-live="polite"
        className="min-h-[2.25rem] shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] leading-tight"
      >
        {failed ??
          (active
            ? `${active.name} · ${number.format(active.subscribers)}명 · ${active.note}`
            : `${pins.length}개사 · 핀에 마우스를 올리면 정밀도를 보여줍니다.`)}
      </p>

      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[10.5px] text-muted-foreground">
        <p className="text-review">{`점선 = 도로 단위 ${approximate}곳 (번지 없음)`}</p>
        {unplaced.length > 0 ? <p>{`좌표 없음 ${unplaced.length}곳 · ${unplaced.join(", ")}`}</p> : null}
      </div>
    </div>
  );
}
