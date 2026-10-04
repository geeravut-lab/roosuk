import { layoutChart, GEO, type ChartPoint } from "@/lib/timeline/charts";
import type { Dict } from "@/lib/i18n/dict";
import { formatDate } from "@/lib/i18n/format";
import type { Lang } from "@/lib/i18n/dict";

const MARK: Record<NonNullable<ChartPoint["status"]>, string> = {
  normal: "var(--color-primary)",
  watch: "var(--color-warn)",
  abnormal: "var(--color-danger)",
  unknown: "var(--color-muted)",
};

/**
 * A small line chart as plain SVG (no chart library, so it costs no JS and
 * prints/screenshots cleanly). It is for reading a trend, not for precision:
 * every value is also listed as text under "show as numbers", which is what a
 * screen reader gets, and status is never colour alone — watch is a diamond,
 * abnormal a triangle, normal a circle.
 */
export function TrendChart({
  t,
  lang,
  title,
  unit,
  points,
  from,
  to,
  band,
  fixedY,
  joinGaps,
  formatValue = (v) => String(Math.round(v * 100) / 100),
}: {
  t: Dict;
  lang: Lang;
  title: string;
  unit: string;
  points: ChartPoint[];
  from: string;
  to: string;
  band?: readonly [number | null, number | null];
  fixedY?: [number, number];
  joinGaps?: boolean;
  formatValue?: (v: number) => string;
}) {
  const layout = layoutChart(points, from, to, { band, fixedY, joinGaps });
  const g = GEO;
  if (layout.points.length === 0)
    return <p className="text-muted text-sm">{t.chartNoData}</p>;

  const last = layout.points[layout.points.length - 1];
  const summary = `${title}: ${layout.points.length} · ${formatDate(lang, last.date)} ${formatValue(last.value)} ${unit}`;
  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${g.width} ${g.height}`}
        role="img"
        aria-label={summary}
        className="h-auto w-full"
      >
        {layout.band ? (
          <rect
            x={g.padX}
            y={layout.band.top}
            width={g.width - 2 * g.padX}
            height={layout.band.bottom - layout.band.top}
            fill="var(--color-tint-secondary)"
          />
        ) : null}
        <line
          x1={g.padX}
          x2={g.width - g.padX}
          y1={g.height - g.padBottom}
          y2={g.height - g.padBottom}
          stroke="var(--color-line)"
        />
        {layout.paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {layout.points.map((p) => {
          const fill = MARK[p.status ?? "normal"];
          const r = layout.points.length > 60 ? 1.8 : 3.5;
          return p.status === "abnormal" ? (
            <polygon
              key={p.date}
              points={`${p.x},${p.y - r - 1} ${p.x - r - 1},${p.y + r} ${p.x + r + 1},${p.y + r}`}
              fill={fill}
            />
          ) : p.status === "watch" ? (
            <rect
              key={p.date}
              x={p.x - r}
              y={p.y - r}
              width={r * 2}
              height={r * 2}
              transform={`rotate(45 ${p.x} ${p.y})`}
              fill={fill}
            />
          ) : (
            <circle key={p.date} cx={p.x} cy={p.y} r={r} fill={fill} />
          );
        })}
        <text
          x={g.padX}
          y={g.height - 6}
          fontSize="10"
          fill="var(--color-muted)"
        >
          {formatDate(lang, from)}
        </text>
        <text
          x={g.width - g.padX}
          y={g.height - 6}
          fontSize="10"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          {formatDate(lang, to)}
        </text>
        <text x={g.padX} y={9} fontSize="10" fill="var(--color-muted)">
          {formatValue(layout.yMax)}
        </text>
        <text
          x={g.width - g.padX}
          y={9}
          fontSize="10"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          {unit}
        </text>
      </svg>
      <details className="text-sm">
        <summary className="text-primary-strong cursor-pointer font-semibold">
          {t.chartShowNumbers}
        </summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-3 font-semibold">
                {t.chartColDate}
              </th>
              <th scope="col" className="py-1 font-semibold">
                {t.chartColValue} ({unit})
              </th>
              {layout.points.some((p) => p.status) ? (
                <th scope="col" className="py-1 font-semibold">
                  {t.chartColStatus}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {[...layout.points].reverse().map((p) => (
              <tr key={p.date} className="border-line border-t">
                <td className="py-1 pr-3">{formatDate(lang, p.date)}</td>
                <td className="py-1">{formatValue(p.value)}</td>
                {layout.points.some((q) => q.status) ? (
                  <td className="py-1">
                    {p.status ? t[`labStatus_${p.status}` as const] : ""}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
