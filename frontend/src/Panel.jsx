import { API, colorFor, planetLabel } from "./utils";
import Astronomer from "./Astronomer";
import { Dashboard } from "./Gauges";

export default function Panel({ planet, siblings, onPick, onClose, onViewSystem, onCompare }) {
  const ly = planet.sy_dist != null ? (planet.sy_dist * 3.2616).toFixed(1) : "unknown";

  return (
    <div className="panel">
      <button onClick={onClose} style={{ float: "right", width: "auto", background: "#26335f", padding: "6px 12px", fontSize: 12 }}>
        Close
      </button>
      <h2>{planet.pl_name}</h2>
      <div style={{ color: "#8d9ac7" }}>
        {planet.type} · host star {planet.hostname}
      </div>

      {siblings.length > 1 && (
        <div style={{ margin: "12px 0" }}>
          <div style={{ color: "#8d9ac7", fontSize: 13, marginBottom: 6 }}>
            {planet.hostname} has {siblings.length} planets at this spot. Pick one:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {siblings.map((s) => {
              const active = s.pl_name === planet.pl_name;
              const col = colorFor(s.hz_status);
              return (
                <button
                  key={s.pl_name}
                  type="button"
                  title={`${s.pl_name} · ${s.hz_status}`}
                  onClick={() => onPick(s)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: `1px solid ${col}`,
                    background: active ? col : "#141b38",
                    color: active ? "#0b1020" : col,
                    fontWeight: 600,
                  }}
                >
                  {planetLabel(s)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Dashboard planet={planet} />

      <dl>
        <dt>Distance from Earth</dt>
        <dd>{ly} light-years</dd>
        <dt>Radius</dt>
        <dd>{planet.pl_rade ?? "n/a"} × Earth</dd>
        <dt>Year length</dt>
        <dd>{planet.pl_orbper != null ? `${planet.pl_orbper} days` : "n/a"}</dd>
        <dt>Discovered</dt>
        <dd>
          {planet.disc_year} ({planet.discoverymethod})
        </dd>
      </dl>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => onViewSystem(planet)} style={{ flex: 1 }}>
          View system
        </button>
        <button
          type="button"
          onClick={() => onCompare(planet)}
          style={{ flex: 1, background: "#141b38", border: "1px solid #3b4a7a" }}
        >
          ⚖ Compare
        </button>
      </div>

      <Astronomer api={API} names={[planet.pl_name]} label={planet.pl_name} />
    </div>
  );
}