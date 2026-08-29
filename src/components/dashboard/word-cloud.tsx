"use client";

import { useState } from "react";

export type CloudItem = { id: number; name: string; value: number; detail?: string };

/**
 * 값을 글자 크기로 옮긴다.
 * 제곱근을 쓴다 - 선형으로 두면 3,034명 하나에 눌려 나머지 49개사가 전부 같은 크기로 뭉갠다.
 */
export function cloudSizes(values: number[], range: { min: number; max: number }) {
  if (values.length === 0) return [];

  const roots = values.map((value) => (value > 0 ? Math.sqrt(value) : 0));
  const low = Math.min(...roots);
  const high = Math.max(...roots);
  const mid = (range.min + range.max) / 2;

  return roots.map((root) =>
    high === low ? mid : Math.round(range.min + ((root - low) / (high - low)) * (range.max - range.min)),
  );
}


export type PlacedItem = CloudItem & {
  size: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const HANGUL = /[\uAC00-\uD7A3\u3131-\u318E]/;
const LINE_HEIGHT = 1.2;
const GAP_X = 10;
const GAP_Y = 4;
const MIN_SCALE = 0.35;
const MAX_SCALE = 3;
const MAX_SIZE = 72;
const STEP = 0.05;

/** 글자 폭을 글자 종류로 어림한다. 서버에서도 같은 값이 나와야 배치가 흔들리지 않는다. */
function estimateWidth(name: string, size: number) {
  let units = 0;
  for (const character of name) {
    units += HANGUL.test(character) ? 1 : character === " " ? 0.35 : 0.55;
  }
  return units * size;
}

function layout(items: CloudItem[], options: { width: number; height: number; min: number; max: number }) {
  const sizes = cloudSizes(
    items.map((item) => item.value),
    { min: options.min, max: options.max },
  );

  const lines: Array<{ nodes: Array<{ item: CloudItem; size: number; width: number }>; width: number; height: number }> = [];
  let line = { nodes: [] as Array<{ item: CloudItem; size: number; width: number }>, width: 0, height: 0 };

  for (const [index, item] of items.entries()) {
    const size = sizes[index];
    const width = estimateWidth(item.name, size) + GAP_X;
    if (line.nodes.length > 0 && line.width + width > options.width) {
      lines.push(line);
      line = { nodes: [], width: 0, height: 0 };
    }
    line.nodes.push({ item, size, width });
    line.width += width;
    line.height = Math.max(line.height, size * LINE_HEIGHT + GAP_Y);
  }
  if (line.nodes.length > 0) lines.push(line);

  const total = lines.reduce((sum, entry) => sum + entry.height, 0);
  const widest = Math.max(...lines.map((entry) => entry.width));
  if (total > options.height || widest > options.width) return null;

  const placed: PlacedItem[] = [];
  let top = -total / 2;
  for (const entry of lines) {
    let left = -entry.width / 2;
    for (const node of entry.nodes) {
      placed.push({
        ...node.item,
        size: node.size,
        x: left + node.width / 2,
        y: top + entry.height / 2,
        width: node.width,
        height: entry.height,
      });
      left += node.width;
    }
    top += entry.height;
  }

  return { placed, used: { width: widest, height: total } };
}

/**
 * 이름을 값 순으로 줄바꿈해 사각 영역에 채운다. 들어갈 때까지 글자 크기를 줄인다.
 * 자리가 없다고 기업을 빼면 화면에서 사라진 기업을 아무도 눈치채지 못한다.
 */
export function packRect(
  items: CloudItem[],
  options: { width: number; height: number; min: number; max: number },
): { placed: PlacedItem[]; dropped: number; scale: number; used: { width: number; height: number } } {
  if (items.length === 0) {
    return { placed: [], dropped: 0, scale: 1, used: { width: options.width, height: options.height } };
  }

  const sorted = [...items].sort((left, right) => right.value - left.value);

  for (let scale = MAX_SCALE; scale >= MIN_SCALE; scale = Math.round((scale - STEP) * 100) / 100) {
    const result = layout(sorted, {
      ...options,
      min: Math.max(6, Math.round(options.min * scale)),
      max: Math.min(MAX_SIZE, Math.max(8, Math.round(options.max * scale))),
    });
    if (result) return { ...result, dropped: 0, scale };
  }

  const result = layout(sorted, {
    ...options,
    width: Number.POSITIVE_INFINITY,
    height: Number.POSITIVE_INFINITY,
    min: 6,
    max: 8,
  });
  return {
    placed: result?.placed ?? [],
    dropped: 0,
    scale: MIN_SCALE,
    used: result?.used ?? { width: options.width, height: options.height },
  };
}

const TONES = 4;

/**
 * 순위를 색 램프의 단계로 옮긴다.
 * 값 비율로 나누면 3,034명 하나 때문에 나머지가 전부 가장 옅은 단계로 몰린다.
 */
export function toneIndex(rank: number, total: number, steps = TONES) {
  if (total <= 1) return 0;
  return Math.min(steps - 1, Math.floor((rank / total) * steps));
}

const number = new Intl.NumberFormat("ko-KR");

/** 서버 컴포넌트가 넘길 수 있도록 포매터를 함수가 아니라 이름으로 받는다. */
export type CloudFormatter = "count" | "eok";

function render(value: number, unit: string, formatter: CloudFormatter) {
  return formatter === "eok" ? `${(value / 1e8).toFixed(1)}억` : `${number.format(value)}${unit}`;
}

/**
 * 기업명을 값에 비례한 글자 크기로 늘어놓는다.
 * 글자 크기는 눈으로 정확히 읽히지 않으므로 각 항목이 정확한 수치를 함께 갖는다.
 */
export function WordCloud({
  items,
  unit,
  formatter = "count",
  width = 460,
  height = 320,
}: {
  items: CloudItem[];
  unit: string;
  formatter?: CloudFormatter;
  width?: number;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <p className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
        표시할 기업이 없습니다.
      </p>
    );
  }

  const { placed, used } = packRect(items, { width, height, min: 11, max: 40 });
  const box = { width: Math.max(used.width, 40), height: Math.max(used.height, 24) };
  const top = placed[0]?.value ?? 1;
  const focused = placed.find((node) => node.id === active) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg border border-border bg-background p-3">
      <svg
        role="list"
        viewBox={`${-box.width / 2} ${-box.height / 2} ${box.width} ${box.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block min-h-0 w-full flex-1"
      >
        {placed.map((node, rank) => {
          const weight = node.value / top;
          const tone = toneIndex(rank, placed.length);
          return (
            <g
              key={node.id}
              role="listitem"
              tabIndex={0}
              aria-label={`${node.name} ${render(node.value, unit, formatter)}`}
              style={{ fontSize: `${node.size}px`, cursor: "default", outline: "none" }}
              onMouseEnter={() => setActive(node.id)}
              onMouseLeave={() => setActive((current) => (current === node.id ? null : current))}
              onFocus={() => setActive(node.id)}
              onBlur={() => setActive((current) => (current === node.id ? null : current))}
            >
              <text
                x={node.x}
                y={node.y}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fontSize: "inherit",
                  fontWeight: weight > 0.5 ? 800 : weight > 0.15 ? 700 : 500,
                  letterSpacing: "-0.02em",
                }}
                fill={`var(--cloud-${tone})`}
                fillOpacity={active === null || active === node.id ? 1 : 0.35}
              >
                {node.name}
              </text>
            </g>
          );
        })}
      </svg>

      <p
        role="status"
        aria-live="polite"
        className="min-h-[1.75rem] shrink-0 rounded-md bg-surface px-2.5 py-1 text-[12px] leading-tight"
      >
        {focused ? (
          <>
            <span className="font-semibold">{focused.name}</span>
            <span className="ml-1.5 font-mono font-bold tabular-nums">
              {render(focused.value, unit, formatter)}
            </span>
            {focused.detail ? (
              <span className="ml-1.5 text-muted-foreground">{focused.detail}</span>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">기업에 마우스를 올리면 값을 보여줍니다.</span>
        )}
      </p>
    </div>
  );
}
