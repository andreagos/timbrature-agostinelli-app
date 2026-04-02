import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, remove } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDxhLmpCqJZ8zWsYISv-n4roSOt40Bl81E",
  authDomain: "timbrature-agriturismo.firebaseapp.com",
  databaseURL: "https://timbrature-agriturismo-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "timbrature-agriturismo",
  storageBucket: "timbrature-agriturismo.firebasestorage.app",
  messagingSenderId: "38182119313",
  appId: "1:38182119313:web:a69fe59f8dc28b24c35c30"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const MANAGER_PIN = "1234";
const WORK_LAT = 45.8089;
const WORK_LNG = 9.0583;
const GEOFENCE_RADIUS_M = 200;

const EMPLOYEES = [
  { id: "1", name: "Marco Rossi" },
  { id: "2", name: "Laura Bianchi" },
  { id: "3", name: "Giuseppe Verdi" },
  { id: "4", name: "Anna Colombo" },
];

const C = {
  bg: "#F5F4F0",
  surface: "#FFFFFF",
  surfaceAlt: "#F0EEE9",
  border: "#E2DDD6",
  borderStrong: "#C8C2B8",
  text: "#1C1A17",
  textSub: "#5C5750",
  textMuted: "#9C9690",
  accent: "#2D6A4F",
  accentLight: "#E8F5EE",
  danger: "#C0392B",
  dangerLight: "#FDEDEC",
  warn: "#B7791F",
  warnLight: "#FFFBEB",
};

const pad = (n) => String(n).padStart(2, "0");

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "--";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return pad(h) + "h " + pad(m) + "m";
}
function formatDate(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function formatTime(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function formatDateShort(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return (
    <div style={{ fontFamily: "monospace", fontSize: 11, color: C.textMuted, textAlign: "right" }}>
      <div>{t.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })}</div>
      <div style={{ color: C.accent, fontWeight: 700, fontSize: 15 }}>
        {pad(t.getHours())}:{pad(t.getMinutes())}:{pad(t.getSeconds())}
      </div>
    </div>
  );
}

function useGps() {
  const [state, setState] = useState("idle");
  const [distance, setDistance] = useState(null);
  const [coords, setCoords] = useState(null);
  const check = () => {
    if (!navigator.geolocation) { setState("error"); return; }
    setState("checking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setCoords({ lat, lng });
        const d = Math.round(haversine(lat, lng, WORK_LAT, WORK_LNG));
        setDistance(d);
        setState(d <= GEOFENCE_RADIUS_M ? "ok" : "far");
      },
      (err) => setState(err.code === 1 ? "denied" : "error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  return { state, distance, coords, check };
}

function GpsBanner({ state, distance, onCheck }) {
  const cfg = {
    idle:     { bg: C.surfaceAlt, border: C.border,   color: C.textSub,  icon: "📍", text: "Verifica posizione GPS" },
    checking: { bg: C.warnLight,  border: "#F6C966",  color: C.warn,     icon: "⏳", text: "Rilevamento GPS in corso…" },
    ok:       { bg: C.accentLight,border: "#6FCF97",  color: C.accent,   icon: "✅", text: "In sede · " + distance + "m dalla sede" },
    far:      { bg: C.dangerLight,border: "#F1948A",  color: C.danger,   icon: "🚫", text: "Troppo lontano · " + distance + "m dalla sede" },
    denied:   { bg: C.dangerLight,border: "#F1948A",  color: C.danger,   icon: "🔒", text: "GPS non autorizzato" },
    error:    { bg: C.warnLight,  border: "#F6C966",  color: C.warn,     icon: "⚠️", text: "Errore GPS — riprova" },
  }[state];
  return (
    <button onClick={onCheck} disabled={state === "checking"} style={{
      display: "flex", alignItems: "center", gap: 10,
      width: "100%", padding: "11px 14px", borderRadius: 12,
      background: cfg.bg, border: "1.5px solid " + cfg.border,
      color: cfg.color, fontSize: 12, fontWeight: 600,
      fontFamily: "monospace", cursor: state === "checking" ? "default" : "pointer",
      textAlign: "left",
    }}>
      <span style={{ fontSize: 18 }}>{cfg.icon}</span>
      <span style={{ flex: 1 }}>{cfg.text}</span>
      {state !== "checking" && <span style={{ opacity: 0.5, fontSize: 10 }}>↺ aggiorna</span>}
    </button>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      background: toast.type === "err" ? C.danger : C.accent,
      color: "#fff", padding: "11px 24px", borderRadius: 50,
      fontSize: 13, fontFamily: "monospace", fontWeight: 600,
      boxShadow: "0 6px 24px rgba(0,0,0,0.18)", zIndex: 999,
      whiteSpace: "nowrap",
    }}>{toast.msg}</div>
  );
}

// POPUP CONFERMA ELIMINAZIONE
function ConfirmModal({ onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        background: C.surface, borderRadius: 20, padding: 28,
        maxWidth: 320, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>🗑️</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, textAlign: "center", marginBottom: 8 }}>
          Elimina timbratura
        </div>
        <div style={{ fontSize: 13, color: C.textSub, textAlign: "center", marginBottom: 24, lineHeight: 1.5 }}>
          Sei sicuro di voler eliminare questa timbratura? L'operazione non può essere annullata.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "12px", background: C.surfaceAlt,
            border: "1.5px solid " + C.border, borderRadius: 12,
            color: C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Annulla</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: "12px", background: C.danger,
            border: "none", borderRadius: 12,
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>Elimina</button>
        </div>
      </div>
    </div>
  );
}

function Pill({ bg, color, children }) {
  return (
    <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 20, background: bg, color, fontFamily: "monospace", fontWeight: 600 }}>
      {children}
    </span>
  );
}

function EntryCard({ entry: e, onDelete }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const dur = new Date(e.dateOut) - new Date(e.dateIn);
  return (
    <>
      {showConfirm && (
        <ConfirmModal
          onConfirm={() => { onDelete(e.firebaseKey); setShowConfirm(false); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
      <div style={{
        background: C.surface, borderRadius: 12, padding: "13px 15px",
        border: "1.5px solid " + C.border, borderLeft: "4px solid " + (e.gps ? C.accent : C.borderStrong),
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {e.employeeName && <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{e.employeeName}</span>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {e.gps && <Pill bg={C.accentLight} color={C.accent}>📍 GPS</Pill>}
            <Pill bg={e.type === "manual" ? "#EEF2FF" : C.accentLight} color={e.type === "manual" ? "#4338CA" : C.accent}>
              {e.type === "manual" ? "Manuale" : "Timer"}
            </Pill>
            {onDelete && (
              <button onClick={() => setShowConfirm(true)} style={{
                padding: "3px 8px", background: "transparent",
                border: "1px solid " + C.border, borderRadius: 6,
                color: C.textMuted, fontSize: 11, cursor: "pointer",
              }}>✕</button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontFamily: "monospace", fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ color: C.textSub }}>{formatDate(e.dateIn)}</span>
          <span style={{ color: C.accent }}>▶ {formatTime(e.dateIn)}</span>
          <span style={{ color: C.textMuted }}>→</span>
          <span style={{ color: C.danger }}>⏹ {formatTime(e.dateOut)}</span>
          <span style={{ marginLeft: "auto", fontWeight: 700, color: C.text, fontSize: 14 }}>{formatDuration(dur)}</span>
        </div>
      </div>
    </>
  );
}

// DASHBOARD REPORT
function Dashboard({ entries }) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisWeek = entries.filter(e => new Date(e.dateIn) >= startOfWeek);
  const thisMonth = entries.filter(e => new Date(e.dateIn) >= startOfMonth);

  const totalMsWeek = thisWeek.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);
  const totalMsMonth = thisMonth.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);

  // Ore per dipendente questo mese
  const empStats = EMPLOYEES.map(emp => {
    const es = thisMonth.filter(e => e.employeeId === emp.id);
    const ms = es.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);
    const h = Math.round(ms / 3600000 * 10) / 10;
    const maxH = 200;
    const pct = Math.min((h / maxH) * 100, 100);
    return { ...emp, ms, h, pct, count: es.length };
  }).sort((a, b) => b.ms - a.ms);

  const maxH = Math.max(...empStats.map(s => s.h), 1);

  // Ultimi 7 giorni
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dEnd = new Date(d);
    dEnd.setHours(23, 59, 59, 999);
    const dayEntries = entries.filter(e => {
      const t = new Date(e.dateIn);
      return t >= d && t <= dEnd;
    });
    const ms = dayEntries.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);
    last7.push({ label: d.toLocaleDateString("it-IT", { weekday: "short" }), date: formatDateShort(d.toISOString()), h: Math.round(ms / 3600000 * 10) / 10, count: dayEntries.length });
  }
  const maxDay = Math.max(...last7.map(d => d.h), 1);

  // Tipo timbrature
  const timerCount = entries.filter(e => e.type === "timer").length;
  const manualCount = entries.filter(e => e.type === "manual").length;
  const total = entries.length || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* KPI TOP */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px" }}>
        <div style={{ ...S.card, padding: 16, background: C.accent }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontFamily: "monospace", letterSpacing: 1, marginBottom: 4 }}>QUESTA SETTIMANA</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", fontFamily: "Georgia, serif" }}>{formatDuration(totalMsWeek)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{thisWeek.length} timbrature</div>
        </div>
        <div style={{ ...S.card, padding: 16 }}>
          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace", letterSpacing: 1, marginBottom: 4 }}>QUESTO MESE</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>{formatDuration(totalMsMonth)}</div>
          <div style={{ fontSize: 11, color: C.textSub, marginTop: 4 }}>{thisMonth.length} timbrature</div>
        </div>
      </div>

      {/* GRAFICO ULTIMI 7 GIORNI */}
      <div style={{ ...S.card, margin: "0 16px" }}>
        <div style={S.eyebrow}>ULTIMI 7 GIORNI</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, marginBottom: 8 }}>
          {last7.map((d, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "monospace" }}>{d.h > 0 ? d.h + "h" : ""}</div>
              <div style={{
                width: "100%", borderRadius: 6,
                height: Math.max((d.h / maxDay) * 60, d.h > 0 ? 4 : 2),
                background: d.h > 0 ? C.accent : C.border,
                transition: "height 0.3s ease",
              }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {last7.map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "monospace", textTransform: "capitalize" }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ORE PER DIPENDENTE */}
      <div style={{ ...S.card, margin: "0 16px" }}>
        <div style={S.eyebrow}>ORE PER DIPENDENTE — MESE CORRENTE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {empStats.map(s => (
            <div key={s.id}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.name}</span>
                <span style={{ fontSize: 13, fontFamily: "monospace", color: C.accent, fontWeight: 700 }}>{formatDuration(s.ms)}</span>
              </div>
              <div style={{ background: C.surfaceAlt, borderRadius: 50, height: 8, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 50,
                  width: ((s.h / maxH) * 100) + "%",
                  background: C.accent,
                  transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace", marginTop: 4 }}>
                {s.count} timbrature
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TIPO TIMBRATURE */}
      <div style={{ ...S.card, margin: "0 16px" }}>
        <div style={S.eyebrow}>TIPO TIMBRATURE — TOTALE</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: C.accentLight, borderRadius: 12, padding: "14px", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.accent, fontFamily: "Georgia, serif" }}>{timerCount}</div>
            <div style={{ fontSize: 11, color: C.accent, fontFamily: "monospace", marginTop: 4 }}>📍 Timer GPS</div>
            <div style={{ fontSize: 10, color: C.textSub, marginTop: 2 }}>{Math.round((timerCount / total) * 100)}%</div>
          </div>
          <div style={{ background: "#EEF2FF", borderRadius: 12, padding: "14px", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#4338CA", fontFamily: "Georgia, serif" }}>{manualCount}</div>
            <div style={{ fontSize: 11, color: "#4338CA", fontFamily: "monospace", marginTop: 4 }}>✏️ Manuali</div>
            <div style={{ fontSize: 10, color: C.textSub, marginTop: 2 }}>{Math.round((manualCount / total) * 100)}%</div>
          </div>
        </div>
        {/* Barra proporzionale */}
        <div style={{ marginTop: 12, background: "#EEF2FF", borderRadius: 50, height: 10, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 50,
            width: ((timerCount / total) * 100) + "%",
            background: C.accent,
          }} />
        </div>
      </div>

      {/* MEDIA ORE GIORNALIERA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px" }}>
        <div style={{ ...S.card, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace", letterSpacing: 1, marginBottom: 6 }}>MEDIA ORE/GIORNO</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>
            {last7.filter(d => d.h > 0).length > 0
              ? (last7.reduce((s, d) => s + d.h, 0) / last7.filter(d => d.h > 0).length).toFixed(1) + "h"
              : "--"}
          </div>
          <div style={{ fontSize: 10, color: C.textSub, marginTop: 4 }}>ultimi 7 giorni</div>
        </div>
        <div style={{ ...S.card, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace", letterSpacing: 1, marginBottom: 6 }}>DIPENDENTI ATTIVI</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>
            {empStats.filter(s => s.count > 0).length}/{EMPLOYEES.length}
          </div>
          <div style={{ fontSize: 10, color: C.textSub, marginTop: 4 }}>questo mese</div>
        </div>
      </div>

    </div>
  );
}

function EmployeeView({ entries }) {
  const [employee, setEmployee] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [mDate, setMDate] = useState("");
  const [mIn, setMIn] = useState("");
  const [mOut, setMOut] = useState("");
  const [tab, setTab] = useState("timer");
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const interval = useRef(null);
  const geo = useGps();

  const toast_ = (msg, type) => { setToast({ msg, type: type || "ok" }); setTimeout(() => setToast(null), 2800); };

  useEffect(() => {
    if (activeTimer) { interval.current = setInterval(() => setElapsed(Date.now() - activeTimer), 1000); }
    else { clearInterval(interval.current); setElapsed(0); }
    return () => clearInterval(interval.current);
  }, [activeTimer]);

  const saveToFirebase = async (entry) => {
    setSaving(true);
    try { await push(ref(db, "timbrature"), entry); }
    catch (e) { toast_("Errore salvataggio — riprova", "err"); }
    setSaving(false);
  };

  if (!loggedIn) return (
    <div style={S.card}>
      <Toast toast={toast} />
      <div style={S.eyebrow}>ACCESSO DIPENDENTE</div>
      <p style={{ color: C.textSub, fontSize: 13, marginBottom: 16 }}>Seleziona il tuo nome per accedere</p>
      <select value={employee} onChange={(e) => setEmployee(e.target.value)} style={S.select}>
        <option value="">— Seleziona —</option>
        {EMPLOYEES.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <button onClick={() => employee && setLoggedIn(true)} disabled={!employee} style={{ ...S.btnPrimary, opacity: employee ? 1 : 0.4 }}>
        ENTRA
      </button>
    </div>
  );

  const empName = EMPLOYEES.find((e) => e.id === employee) && EMPLOYEES.find((e) => e.id === employee).name;
  const myEntries = entries.filter((e) => e.employeeId === employee).sort((a, b) => new Date(b.dateIn) - new Date(a.dateIn)).slice(0, 6);

  const startTimer = () => {
    if (geo.state !== "ok") { toast_("Devi essere in sede per timbrare", "err"); return; }
    setActiveTimer(Date.now());
    toast_("Buona giornata! Timer avviato ✓");
  };

  const stopTimer = async () => {
    const dateIn = new Date(Date.now() - elapsed).toISOString();
    const dateOut = new Date().toISOString();
    setActiveTimer(null);
    await saveToFirebase({ employeeId: employee, employeeName: empName, dateIn, dateOut, type: "timer", gps: geo.coords });
    toast_("Timbratura salvata ✓");
  };

  const saveManual = async () => {
    if (!mDate || !mIn || !mOut) { toast_("Compila tutti i campi", "err"); return; }
    const dateIn = new Date(mDate + "T" + mIn).toISOString();
    const dateOut = new Date(mDate + "T" + mOut).toISOString();
    if (new Date(dateOut) <= new Date(dateIn)) { toast_("L'uscita deve essere dopo l'entrata", "err"); return; }
    await saveToFirebase({ employeeId: employee, employeeName: empName, dateIn, dateOut, type: "manual" });
    setMDate(""); setMIn(""); setMOut("");
    toast_("Timbratura manuale salvata ✓");
  };

  return (
    <>
      <Toast toast={toast} />
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={S.eyebrow}>DIPENDENTE</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>{empName}</div>
          </div>
          <button onClick={() => { setLoggedIn(false); setActiveTimer(null); }} style={S.btnGhost}>Esci</button>
        </div>

        <div style={S.tabs}>
          {[["timer", "⏱ Timer"], ["manual", "✏️ Manuale"], ["history", "📋 Storico"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={tab === k ? S.tabOn : S.tabOff}>{l}</button>
          ))}
        </div>

        {tab === "timer" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <GpsBanner state={geo.state} distance={geo.distance} onCheck={geo.check} />
            </div>
            {!activeTimer && geo.state !== "ok" && (
              <div style={{ display: "flex", gap: 12, background: C.warnLight, border: "1.5px solid #F6C96640", borderRadius: 12, padding: "13px 16px", marginBottom: 16 }}>
                <span style={{ fontSize: 22 }}>📍</span>
                <div>
                  <div style={{ fontWeight: 600, color: C.warn, fontSize: 13 }}>Posizione richiesta</div>
                  <div style={{ fontSize: 12, color: C.textSub, marginTop: 3, lineHeight: 1.5 }}>
                    Il timer si avvia solo quando sei in sede (entro {GEOFENCE_RADIUS_M}m).
                  </div>
                </div>
              </div>
            )}
            <div style={{ textAlign: "center", padding: "12px 0 20px" }}>
              {activeTimer ? (
                <>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginBottom: 6 }}>
                    ENTRATA · {formatTime(new Date(Date.now() - elapsed).toISOString())}
                  </div>
                  <div style={{ fontSize: 64, fontWeight: 900, color: C.accent, fontFamily: "Georgia, serif", lineHeight: 1, marginBottom: 6 }}>
                    {formatDuration(elapsed)}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginBottom: 24 }}>ORE LAVORATE</div>
                  <button onClick={stopTimer} disabled={saving} style={{ ...S.btnDanger, opacity: saving ? 0.6 : 1 }}>
                    {saving ? "SALVATAGGIO…" : "⏹ TIMBRA USCITA"}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 64, fontWeight: 900, color: C.borderStrong, fontFamily: "Georgia, serif", lineHeight: 1, marginBottom: 6 }}>
                    --:--
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginBottom: 24 }}>TIMER NON ATTIVO</div>
                  <button onClick={startTimer} disabled={geo.state !== "ok"} style={{ ...S.btnPrimary, opacity: geo.state === "ok" ? 1 : 0.38 }}>
                    ▶ TIMBRA ENTRATA
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {tab === "manual" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#EEF2FF", border: "1.5px solid #C7D2FE", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#4338CA", fontFamily: "monospace", lineHeight: 1.5 }}>
              ✏️ La timbratura manuale non richiede GPS — sarà visibile al manager come "Manuale"
            </div>
            <div>
              <label style={S.label}>Data</label>
              <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} style={S.input} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={S.label}>Entrata</label><input type="time" value={mIn} onChange={(e) => setMIn(e.target.value)} style={S.input} /></div>
              <div><label style={S.label}>Uscita</label><input type="time" value={mOut} onChange={(e) => setMOut(e.target.value)} style={S.input} /></div>
            </div>
            <button onClick={saveManual} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? "SALVATAGGIO…" : "SALVA TIMBRATURA"}
            </button>
          </div>
        )}

        {tab === "history" && (
          <div>
            {myEntries.length === 0
              ? <div style={{ color: C.textMuted, textAlign: "center", padding: "28px 0", fontSize: 13, fontFamily: "monospace" }}>Nessuna timbratura</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {myEntries.map((e) => <EntryCard key={e.firebaseKey} entry={e} />)}
                </div>
            }
          </div>
        )}
      </div>
    </>
  );
}

function ManagerView({ entries }) {
  const [pin, setPin] = useState("");
  const [auth, setAuth] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [fEmp, setFEmp] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [pinErr, setPinErr] = useState(false);

  const check = () => { if (pin === MANAGER_PIN) { setAuth(true); setPinErr(false); } else { setPinErr(true); setPin(""); } };

  const deleteEntry = async (firebaseKey) => {
    await remove(ref(db, "timbrature/" + firebaseKey));
  };

  const filtered = entries.filter((e) => {
    if (fEmp !== "all" && e.employeeId !== fEmp) return false;
    if (fFrom && new Date(e.dateIn) < new Date(fFrom)) return false;
    if (fTo && new Date(e.dateIn) > new Date(fTo + "T23:59:59")) return false;
    return true;
  }).sort((a, b) => new Date(b.dateIn) - new Date(a.dateIn));

  const totalMs = filtered.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);

  if (!auth) return (
    <div style={S.card}>
      <div style={S.eyebrow}>ACCESSO MANAGER</div>
      <p style={{ color: C.textSub, fontSize: 13, marginBottom: 20 }}>Inserisci il PIN per accedere al pannello</p>
      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginBottom: 6 }}>Demo PIN: 1234</div>
      <input type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder="• • • •" style={{ ...S.input, textAlign: "center", fontSize: 30, letterSpacing: 14 }} />
      {pinErr && <div style={{ color: C.danger, fontSize: 12, marginTop: 8 }}>PIN errato</div>}
      <button onClick={check} style={{ ...S.btnPrimary, marginTop: 16 }}>ACCEDI</button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header manager */}
      <div style={{ ...S.card, margin: "0 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={S.eyebrow}>PANNELLO MANAGER</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>Agostinelli</div>
          </div>
          <button onClick={() => setAuth(false)} style={S.btnGhost}>Esci</button>
        </div>
      </div>

      {/* Tab manager */}
      <div style={{ padding: "0 16px", marginBottom: 12 }}>
        <div style={S.tabs}>
          {[["dashboard", "📊 Dashboard"], ["timbrature", "📋 Timbrature"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={tab === k ? S.tabOn : S.tabOff}>{l}</button>
          ))}
        </div>
      </div>

      {tab === "dashboard" && <Dashboard entries={entries} />}

      {tab === "timbrature" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Totali */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px" }}>
            <div style={{ background: C.accentLight, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: C.accent, fontFamily: "monospace", letterSpacing: 1, marginBottom: 4 }}>ORE TOTALI</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.accent, fontFamily: "Georgia, serif" }}>{formatDuration(totalMs)}</div>
            </div>
            <div style={{ background: C.surfaceAlt, borderRadius: 12, padding: "12px 14px", border: "1.5px solid " + C.border }}>
              <div style={{ fontSize: 10, color: C.textSub, fontFamily: "monospace", letterSpacing: 1, marginBottom: 4 }}>TIMBRATURE</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>{filtered.length}</div>
            </div>
          </div>

          {/* Filtri */}
          <div style={{ ...S.card, margin: "0 16px" }}>
            <div style={S.eyebrow}>FILTRI</div>
            <select value={fEmp} onChange={(e) => setFEmp(e.target.value)} style={{ ...S.select, marginBottom: 10 }}>
              <option value="all">Tutti i dipendenti</option>
              {EMPLOYEES.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={S.label}>Dal</label><input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} style={S.input} /></div>
              <div><label style={S.label}>Al</label><input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} style={S.input} /></div>
            </div>
            {(fEmp !== "all" || fFrom || fTo) && (
              <button onClick={() => { setFEmp("all"); setFFrom(""); setFTo(""); }} style={{ ...S.btnGhost, marginTop: 10, width: "100%" }}>
                Reset filtri
              </button>
            )}
          </div>

          {/* Lista */}
          <div style={{ padding: "0 16px" }}>
            <div style={{ ...S.eyebrow, marginBottom: 10 }}>{filtered.length} TIMBRATURE</div>
            {filtered.length === 0
              ? <div style={{ background: C.surface, borderRadius: 12, padding: 28, textAlign: "center", color: C.textMuted, fontSize: 13, fontFamily: "monospace", border: "1.5px solid " + C.border }}>Nessuna timbratura trovata</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filtered.map((e) => <EntryCard key={e.firebaseKey} entry={e} onDelete={deleteEntry} />)}
                </div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("employee");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const entriesRef = ref(db, "timbrature");
    const unsub = onValue(entriesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([key, val]) => ({ ...val, firebaseKey: key }));
        setEntries(list);
      } else {
        setEntries([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, paddingBottom: 48 }}>
      <style>{"* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'DM Sans', sans-serif; } select, input { outline: none; } select:focus, input:focus { border-color: " + C.accent + " !important; box-shadow: 0 0 0 3px " + C.accentLight + "; } button:active { transform: scale(0.97); }"}</style>

      <div style={{ background: C.surface, borderBottom: "1.5px solid " + C.border, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
        <div>
          <div style={{ fontSize: 9, color: C.accent, letterSpacing: 3, fontFamily: "monospace", fontWeight: 700 }}>AGOSTINELLI</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>Timbrature</div>
        </div>
        <Clock />
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", background: C.surface, borderRadius: 12, border: "1.5px solid " + C.border, overflow: "hidden" }}>
          {[["employee", "👤 Dipendente"], ["manager", "🔑 Manager"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ flex: 1, padding: "11px 8px", background: view === k ? C.accent : "transparent", border: "none", color: view === k ? "#fff" : C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.18s" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.textMuted, fontFamily: "monospace", fontSize: 13 }}>
          Connessione a Firebase…
        </div>
      ) : (
        <div style={{ padding: view === "manager" ? "16px 0 0" : "16px" }}>
          {view === "employee" ? <EmployeeView entries={entries} /> : <ManagerView entries={entries} />}
        </div>
      )}
    </div>
  );
}

const S = {
  card: { background: C.surface, borderRadius: 16, padding: 20, border: "1.5px solid " + C.border, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" },
  eyebrow: { fontSize: 9, color: C.accent, letterSpacing: 3, fontFamily: "monospace", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" },
  label: { display: "block", fontSize: 10, color: C.textSub, letterSpacing: 1.5, marginBottom: 6, fontFamily: "monospace", textTransform: "uppercase" },
  input: { width: "100%", padding: "10px 12px", background: C.surfaceAlt, border: "1.5px solid " + C.border, borderRadius: 10, color: C.text, fontSize: 14, colorScheme: "light" },
  select: { width: "100%", padding: "10px 12px", background: C.surfaceAlt, border: "1.5px solid " + C.border, borderRadius: 10, color: C.text, fontSize: 14 },
  btnPrimary: { width: "100%", padding: "13px", background: C.accent, border: "none", borderRadius: 12, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", letterSpacing: 1.5 },
  btnDanger: { width: "100%", padding: "13px", background: C.danger, border: "none", borderRadius: 12, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", letterSpacing: 1.5 },
  btnGhost: { padding: "7px 16px", background: "transparent", border: "1.5px solid " + C.border, borderRadius: 8, color: C.textSub, fontSize: 12, fontFamily: "monospace", cursor: "pointer" },
  tabs: { display: "flex", gap: 4, marginBottom: 0, background: C.surfaceAlt, borderRadius: 10, padding: 4 },
  tabOn: { flex: 1, padding: "8px 4px", background: C.surface, border: "none", color: C.accent, fontSize: 11, cursor: "pointer", fontFamily: "monospace", fontWeight: 700, borderRadius: 7, boxShadow: "0 1px 4px rgba(0,0,0,0.1)" },
  tabOff: { flex: 1, padding: "8px 4px", background: "transparent", border: "none", color: C.textSub, fontSize: 11, cursor: "pointer", fontFamily: "monospace", borderRadius: 7 },
};
