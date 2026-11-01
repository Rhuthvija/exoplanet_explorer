import { useEffect, useRef, useState } from "react";

const QUICK = [
  { label: "Could life exist here?", mode: "life" },
  { label: "How does it compare to Earth?", mode: "earth" },
  { label: "What makes it special?", mode: "special" },
];

const css = `
@keyframes astro-blink { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }
@keyframes astro-pop { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
`;

const pill = {
  width: "auto",
  marginTop: 0,
  padding: "4px 10px",
  fontSize: 11,
  borderRadius: 999,
  border: "1px solid rgba(196,206,255,0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "#959db8",
};

export default function Astronomer({ api, names, label }) {
  const key = names.join("|");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [facts, setFacts] = useState(null);
  const listRef = useRef(null);
  const abortRef = useRef(null);

  // reset the conversation whenever the subject changes
  useEffect(() => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setBusy(false);
    setFacts(null);
    if (names.length === 1) {
      const ctrl = new AbortController();
      fetch(`${api}/facts/${encodeURIComponent(names[0])}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setFacts(d))
        .catch(() => {});
      return () => ctrl.abort();
    }
  }, [api, key]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(text, mode = "free") {
    const message = text.trim();
    if (!message || busy || !names.length) return;

    const history = messages
      .filter((m) => !m.error && m.content)
      .slice(-4)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`${api}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, planets: names, history, mode }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const snapshot = acc;
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", content: snapshot };
          return copy;
        });
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = {
          role: "assistant",
          content: `Sorry, I couldn't reach the AI model. (${err.message})`,
          error: true,
        };
        return copy;
      });
    }
    setBusy(false);
  }

  function clear() {
    abortRef.current?.abort();
    setMessages([]);
    setBusy(false);
  }

  const lastIndex = messages.length - 1;

  return (
    <div className="sx-section" style={{ borderTop: "1px solid rgba(196,206,255,0.12)", paddingTop: 16 }}>
      <style>{css}</style>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 30%, #ffffff, #b9c2f0 45%, #4b5590 100%)",
            display: "grid",
            placeItems: "center",
            fontSize: 17,
            flexShrink: 0,
          }}
        >
          🔭
        </div>
        <div style={{ lineHeight: 1.25, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>Astro</div>
          <div style={{ fontSize: 11, color: "#959db8" }}>Virtual astronomer · answers from NASA data only</div>
        </div>
        {messages.length > 0 && (
          <button type="button" onClick={clear} style={{ ...pill, cursor: "pointer" }}>
            Clear
          </button>
        )}
      </div>

      {/* facts the astronomer was given for this planet */}
      {facts && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          {facts.chips.map((c) => (
            <span key={c} style={{ ...pill, cursor: "default" }}>
              {c}
            </span>
          ))}
        </div>
      )}

      {/* conversation */}
      <div
        ref={listRef}
        style={{
          maxHeight: 260,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingRight: 2,
        }}
      >
        {messages.length === 0 && (
          <div style={bubble(false)}>
            Hi, I'm Astro. Ask me about {label}. I only use NASA's data, and I'll say so when something isn't known.
          </div>
        )}
        {messages.map((m, i) => {
          const streaming = busy && i === lastIndex && m.role === "assistant";
          return (
            <div key={i} style={bubble(m.role === "user", m.error)}>
              {m.content}
              {streaming && m.content && (
                <span style={{ animation: "astro-blink 1s infinite", marginLeft: 2 }}>▍</span>
              )}
              {streaming && !m.content && (
                <span style={{ color: "#959db8", animation: "astro-blink 1.2s infinite" }}>Astro is thinking…</span>
              )}
            </div>
          );
        })}
      </div>

      {/* quick questions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0 8px" }}>
        {QUICK.map((q) => (
          <button
            key={q.mode}
            type="button"
            disabled={busy}
            onClick={() => send(q.label, q.mode)}
            style={{
              ...pill,
              padding: "6px 11px",
              fontSize: 12,
              color: "#d6dbea",
              border: "1px solid #3b4a7a",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.5 : 1,
            }}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input, "free");
        }}
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your own question…"
          style={{
            flex: 1,
            minWidth: 0,
            width: "auto",
            margin: 0,
            padding: "10px 14px",
            fontSize: 14,
            borderRadius: 999,
            border: "1px solid rgba(196,206,255,0.16)",
            background: "rgba(255,255,255,0.04)",
            color: "#e9ecf6",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            width: 40,
            height: 40,
            marginTop: 0,
            padding: 0,
            borderRadius: "50%",
            border: "none",
            background: "linear-gradient(180deg, #e3e7ff, #aeb8ee)",
            color: "#0b0d1c",
            fontSize: 16,
            cursor: busy || !input.trim() ? "default" : "pointer",
            opacity: busy || !input.trim() ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          ➤
        </button>
      </form>
    </div>
  );
}

function bubble(isUser, isError) {
  return {
    alignSelf: isUser ? "flex-end" : "flex-start",
    maxWidth: "92%",
    padding: "9px 13px",
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    color: isError ? "#fca5a5" : "#e9ecf6",
    background: isUser ? "rgba(182,168,255,0.24)" : "rgba(255,255,255,0.05)",
    border: isUser ? "none" : `1px solid ${isError ? "#7f1d1d" : "rgba(196,206,255,0.16)"}`,
    borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
    animation: "astro-pop 0.25s ease-out",
  };
}