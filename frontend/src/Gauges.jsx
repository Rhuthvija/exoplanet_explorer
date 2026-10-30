import { colorFor } from "./utils";

const clamp = (v) => Math.min(1, Math.max(0, v));
const logPos = (f) => clamp((Math.log10(Math.max(f, 0.001)) + 2) / 4); // 0.01x to 100x Earth

export function EsiRing({ esi, size = 84 }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const v = esi == null ? 0 : clamp(esi);
  const col = esi == null ? "#475569" : esi >= 0.8 ? "#4ade80" : esi >= 0.6 ? "#facc15" : "#fb923c";
  return (
    <svg width={size} height={size} viewBox="0 0 84 84" style={{ flexShrink: 0 }}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="#1b2548" strokeWidth="8" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke={col}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`}
        transform="rotate(-90 42 42)"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text x="42" y="42" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="18" fontWeight="700">
        {esi == null ? "n/a" : esi.toFixed(2)}
      </text>
    </svg>
  );
}

function Gauge({ label, valueText, pos, earthPos, zone, color, note }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span style={{ color: "#8d9ac7" }}>{label}</span>
        <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{valueText}</span>
      </div>
      <div style={{ position: "relative", height: 8, borderRadius: 999, background: "#1b2548", margin: "9px 0 5px" }}>
        {zone && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${zone[0] * 100}%`,
              width: `${(zone[1] - zone[0]) * 100}%`,
              background: "#4ade8050",
              borderRadius: 999,
            }}
          />
        )}
        {earthPos != null && (
          <div style={{ position: "absolute", top: -3, bottom: -3, left: `${earthPos * 100}%`, width: 2, background: "#7dd3fc" }} />
        )}
        {pos != null && (
          <div
            style={{
              position: "absolute",
              top: -3,
              left: `calc(${pos * 100}% - 7px)`,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: color,
              border: "2px solid #0b1020",
              transition: "left 0.6s ease",
            }}
          />
        )}
      </div>
      {note && <div style={{ fontSize: 10.5, color: "#6b7aa8" }}>{note}</div>}
    </div>
  );
}

export function StarlightGauge({ flux }) {
  const pct = flux != null ? flux * 100 : null;
  const text = pct == null ? "n/a" : `${pct >= 10 ? Math.round(pct).toLocaleString() : Number(pct.toPrecision(2))}% of Earth's`;
  return (
    <Gauge
      label="Starlight received"
      valueText={text}
      pos={flux != null ? logPos(flux) : null}
      earthPos={logPos(1)}
      zone={[logPos(0.36), logPos(1.1)]}
      color="#fde68a"
      note="Log scale · green band = habitable zone · blue line = Earth"
    />
  );
}

export function TempGauge({ eq }) {
  return (
    <Gauge
      label="Equilibrium temperature"
      valueText={eq != null ? `${Math.round(eq)} K (${Math.round(eq - 273.15)} °C)` : "n/a"}
      pos={eq != null ? clamp(eq / 1500) : null}
      earthPos={255 / 1500}
      color="#fb923c"
      note="Scale 0–1500 K · blue line = Earth's (255 K) · not a surface temperature"
    />
  );
}

export function Dashboard({ planet: p }) {
  const label =
    p.esi == null ? "Not enough data" : p.esi >= 0.8 ? "High similarity" : p.esi >= 0.6 ? "Moderate similarity" : "Low similarity";
  const hzCol = colorFor(p.hz_status);
  return (
    <div style={{ margin: "14px 0 8px", padding: 14, borderRadius: 14, background: "#0f1530", border: "1px solid #1d2850" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <EsiRing esi={p.esi} />
        <div>
          <div style={{ fontSize: 12, color: "#8d9ac7" }}>Earth Similarity Index</div>
          <div style={{ fontWeight: 700 }}>{label}</div>
          {p.esi != null && <div style={{ fontSize: 11, color: "#6b7aa8" }}>based on {p.esi_factors} of 4 factors</div>}
          <span
            style={{
              display: "inline-block",
              marginTop: 6,
              padding: "2px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              color: hzCol,
              border: `1px solid ${hzCol}`,
            }}
          >
            {p.hz_status}
          </span>
        </div>
      </div>
      <StarlightGauge flux={p.flux} />
      <TempGauge eq={p.pl_eqt} />
    </div>
  );
}