import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, remove, set, update } from "firebase/database";

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

const MANAGER_PIN = "147852";
const WORK_LAT = 45.8089;
const WORK_LNG = 9.0583;
const GEOFENCE_RADIUS_M = 200;

const C = {
  bg: "#F5F4F0", surface: "#FFFFFF", surfaceAlt: "#F0EEE9",
  border: "#E2DDD6", borderStrong: "#C8C2B8",
  text: "#1C1A17", textSub: "#5C5750", textMuted: "#9C9690",
  accent: "#2D6A4F", accentLight: "#E8F5EE",
  danger: "#C0392B", dangerLight: "#FDEDEC",
  warn: "#B7791F", warnLight: "#FFFBEB",
};

const pad = (n) => String(n).padStart(2, "0");

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return hash.toString(36);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180, dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "--";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
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

// ── EXPORT CSV (Excel) ────────────────────────────────────
function exportCSV(entries, employees, filename) {
  const rows = [["Nome", "Data", "Entrata", "Uscita", "Ore lavorate", "Tipo", "Nota"]];
  entries.sort((a, b) => new Date(a.dateIn) - new Date(b.dateIn)).forEach(e => {
    const ms = new Date(e.dateOut) - new Date(e.dateIn);
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    rows.push([
      e.employeeName || "",
      formatDate(e.dateIn),
      formatTime(e.dateIn),
      formatTime(e.dateOut),
      pad(h) + ":" + pad(m),
      e.type === "manual" ? "Manuale" : "Timer GPS",
      e.nota || ""
    ]);
  });
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename + ".csv"; a.click();
  URL.revokeObjectURL(url);
}

// ── EXPORT HTML/PDF ───────────────────────────────────────
function exportPDF(entries, title) {
  const sorted = [...entries].sort((a, b) => new Date(a.dateIn) - new Date(b.dateIn));
  const totalMs = sorted.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);
  const rows = sorted.map(e => {
    const ms = new Date(e.dateOut) - new Date(e.dateIn);
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return "<tr><td>" + (e.employeeName || "") + "</td><td>" + formatDate(e.dateIn) + "</td><td>" + formatTime(e.dateIn) + "</td><td>" + formatTime(e.dateOut) + "</td><td>" + pad(h) + "h " + pad(m) + "m</td><td>" + (e.type === "manual" ? "Manuale" : "GPS") + "</td><td>" + (e.nota || "") + "</td></tr>";
  }).join("");
  const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + title + "</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#1C1A17}h1{color:#2D6A4F;font-size:20px}h2{color:#5C5750;font-size:14px;font-weight:normal;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px}th{background:#2D6A4F;color:#fff;padding:8px;text-align:left}td{padding:8px;border-bottom:1px solid #E2DDD6}tr:nth-child(even){background:#F5F4F0}.totale{margin-top:16px;font-weight:700;font-size:14px;color:#2D6A4F}@media print{button{display:none}}</style></head><body><h1>Agriturismo Agostinelli — Timbrature</h1><h2>" + title + " · " + sorted.length + " timbrature</h2><table><thead><tr><th>Dipendente</th><th>Data</th><th>Entrata</th><th>Uscita</th><th>Ore</th><th>Tipo</th><th>Nota</th></tr></thead><tbody>" + rows + "</tbody></table><p class='totale'>Totale ore: " + formatDuration(totalMs) + "</p><button onclick='window.print()' style='margin-top:20px;padding:10px 20px;background:#2D6A4F;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px'>🖨️ Stampa / Salva PDF</button></body></html>";
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
}

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return (
    <div style={{ fontFamily: "monospace", fontSize: 11, color: C.textMuted, textAlign: "right" }}>
      <div>{t.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })}</div>
      <div style={{ color: C.accent, fontWeight: 700, fontSize: 15 }}>{pad(t.getHours())}:{pad(t.getMinutes())}:{pad(t.getSeconds())}</div>
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
    idle:     { bg: C.surfaceAlt, border: C.border,  color: C.textSub, icon: "📍", text: "Verifica posizione GPS" },
    checking: { bg: C.warnLight,  border: "#F6C966", color: C.warn,    icon: "⏳", text: "Rilevamento GPS…" },
    ok:       { bg: C.accentLight,border: "#6FCF97", color: C.accent,  icon: "✅", text: "In sede · " + distance + "m" },
    far:      { bg: C.dangerLight,border: "#F1948A", color: C.danger,  icon: "🚫", text: "Troppo lontano · " + distance + "m" },
    denied:   { bg: C.dangerLight,border: "#F1948A", color: C.danger,  icon: "🔒", text: "GPS non autorizzato" },
    error:    { bg: C.warnLight,  border: "#F6C966", color: C.warn,    icon: "⚠️", text: "Errore GPS — riprova" },
  }[state];
  return (
    <button onClick={onCheck} disabled={state === "checking"} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 14px", borderRadius: 12,
      background: cfg.bg, border: "1.5px solid " + cfg.border, color: cfg.color,
      fontSize: 12, fontWeight: 600, fontFamily: "monospace", cursor: state === "checking" ? "default" : "pointer", textAlign: "left",
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
      boxShadow: "0 6px 24px rgba(0,0,0,0.18)", zIndex: 999, whiteSpace: "nowrap",
    }}>{toast.msg}</div>
  );
}

function ConfirmModal({ onConfirm, onCancel, title, message }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: 20, padding: 28, maxWidth: 320, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>🗑️</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, textAlign: "center", marginBottom: 8 }}>{title || "Conferma"}</div>
        <div style={{ fontSize: 13, color: C.textSub, textAlign: "center", marginBottom: 24, lineHeight: 1.5 }}>{message || "Sei sicuro?"}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px", background: C.surfaceAlt, border: "1.5px solid " + C.border, borderRadius: 12, color: C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annulla</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "12px", background: C.danger, border: "none", borderRadius: 12, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Elimina</button>
        </div>
      </div>
    </div>
  );
}

function Pill({ bg, color, children }) {
  return <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 20, background: bg, color, fontFamily: "monospace", fontWeight: 600 }}>{children}</span>;
}

function EntryCard({ entry: e, onDelete }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const dur = new Date(e.dateOut) - new Date(e.dateIn);
  return (
    <>
      {showConfirm && <ConfirmModal onConfirm={() => { onDelete(e.firebaseKey); setShowConfirm(false); }} onCancel={() => setShowConfirm(false)} title="Elimina timbratura" message="Sei sicuro di voler eliminare questa timbratura?" />}
      <div style={{ background: C.surface, borderRadius: 12, padding: "13px 15px", border: "1.5px solid " + C.border, borderLeft: "4px solid " + (e.gps ? C.accent : C.borderStrong) }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {e.employeeName && <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{e.employeeName}</span>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {e.gps && <Pill bg={C.accentLight} color={C.accent}>📍 GPS</Pill>}
            <Pill bg={e.type === "manual" ? "#EEF2FF" : C.accentLight} color={e.type === "manual" ? "#4338CA" : C.accent}>{e.type === "manual" ? "Manuale" : "Timer"}</Pill>
            {onDelete && <button onClick={() => setShowConfirm(true)} style={{ padding: "3px 8px", background: "transparent", border: "1px solid " + C.border, borderRadius: 6, color: C.textMuted, fontSize: 11, cursor: "pointer" }}>✕</button>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontFamily: "monospace", fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ color: C.textSub }}>{formatDate(e.dateIn)}</span>
          <span style={{ color: C.accent }}>▶ {formatTime(e.dateIn)}</span>
          <span style={{ color: C.textMuted }}>→</span>
          <span style={{ color: C.danger }}>⏹ {formatTime(e.dateOut)}</span>
          <span style={{ marginLeft: "auto", fontWeight: 700, color: C.text, fontSize: 14 }}>{formatDuration(dur)}</span>
        </div>
        {e.nota && <div style={{ marginTop: 6, fontSize: 11, color: C.textSub, fontFamily: "monospace", background: C.surfaceAlt, padding: "4px 8px", borderRadius: 6 }}>📝 {e.nota}</div>}
      </div>
    </>
  );
}

// ── REGISTRAZIONE ──────────────────────────────────────────
function RegisterScreen({ onBack, onSuccess, employees }) {
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError("");
    if (!nome || !cognome || !email || !password || !password2) { setError("Compila tutti i campi"); return; }
    if (!email.includes("@")) { setError("Email non valida"); return; }
    if (password.length < 6) { setError("La password deve avere almeno 6 caratteri"); return; }
    if (password !== password2) { setError("Le password non coincidono"); return; }
    if (employees.find(e => e.email === email.toLowerCase())) { setError("Email già registrata"); return; }
    setLoading(true);
    try {
      const newRef = push(ref(db, "employees"));
      await set(newRef, { nome, cognome, email: email.toLowerCase(), passwordHash: simpleHash(password), createdAt: new Date().toISOString() });
      onSuccess({ id: newRef.key, nome, cognome, email: email.toLowerCase() });
    } catch (e) { setError("Errore — riprova"); }
    setLoading(false);
  };

  return (
    <div style={S.card}>
      <div style={S.eyebrow}>CREA ACCOUNT</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif", marginBottom: 20 }}>Registrati</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={S.label}>Nome</label><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Marco" style={S.input} /></div>
          <div><label style={S.label}>Cognome</label><input value={cognome} onChange={e => setCognome(e.target.value)} placeholder="Rossi" style={S.input} /></div>
        </div>
        <div><label style={S.label}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="marco@email.it" style={S.input} /></div>
        <div><label style={S.label}>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimo 6 caratteri" style={S.input} /></div>
        <div><label style={S.label}>Conferma password</label><input type="password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="Ripeti la password" style={S.input} /></div>
        {error && <div style={{ color: C.danger, fontSize: 12, fontFamily: "monospace" }}>⚠️ {error}</div>}
        <button onClick={handleRegister} disabled={loading} style={{ ...S.btnPrimary, opacity: loading ? 0.6 : 1 }}>{loading ? "REGISTRAZIONE…" : "CREA ACCOUNT"}</button>
        <button onClick={onBack} style={S.btnGhost}>← Torna al login</button>
      </div>
    </div>
  );
}

// ── LOGIN ──────────────────────────────────────────────────
function LoginScreen({ onLogin, onRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const unsub = onValue(ref(db, "employees"), snap => {
      const data = snap.val();
      setEmployees(data ? Object.entries(data).map(([k, v]) => ({ ...v, id: k })) : []);
    });
    return () => unsub();
  }, []);

  const handleLogin = () => {
    setError("");
    if (!email || !password) { setError("Inserisci email e password"); return; }
    const emp = employees.find(e => e.email === email.toLowerCase());
    if (!emp) { setError("Email non trovata"); return; }
    if (emp.passwordHash !== simpleHash(password)) { setError("Password errata"); return; }
    onLogin(emp);
  };

  return (
    <div style={S.card}>
      <div style={S.eyebrow}>ACCESSO DIPENDENTE</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif", marginBottom: 20 }}>Accedi</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><label style={S.label}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="la-tua@email.it" style={S.input} /></div>
        <div><label style={S.label}>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••" style={S.input} /></div>
        {error && <div style={{ color: C.danger, fontSize: 12, fontFamily: "monospace" }}>⚠️ {error}</div>}
        <button onClick={handleLogin} style={S.btnPrimary}>ACCEDI</button>
        <div style={{ textAlign: "center", fontSize: 12, color: C.textSub }}>Non hai un account?</div>
        <button onClick={() => onRegister(employees)} style={S.btnGhost}>Registrati →</button>
      </div>
    </div>
  );
}

// ── RESET PASSWORD ─────────────────────────────────────────
function ResetPasswordScreen({ emp, onBack, onSuccess }) {
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setError("");
    if (!oldPwd || !newPwd || !newPwd2) { setError("Compila tutti i campi"); return; }
    if (simpleHash(oldPwd) !== emp.passwordHash) { setError("Password attuale errata"); return; }
    if (newPwd.length < 6) { setError("La nuova password deve avere almeno 6 caratteri"); return; }
    if (newPwd !== newPwd2) { setError("Le nuove password non coincidono"); return; }
    setLoading(true);
    try {
      await update(ref(db, "employees/" + emp.id), { passwordHash: simpleHash(newPwd) });
      onSuccess();
    } catch (e) { setError("Errore — riprova"); }
    setLoading(false);
  };

  return (
    <div style={S.card}>
      <div style={S.eyebrow}>SICUREZZA</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif", marginBottom: 20 }}>Cambia password</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><label style={S.label}>Password attuale</label><input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder="••••••" style={S.input} /></div>
        <div><label style={S.label}>Nuova password</label><input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Minimo 6 caratteri" style={S.input} /></div>
        <div><label style={S.label}>Conferma nuova password</label><input type="password" value={newPwd2} onChange={e => setNewPwd2(e.target.value)} placeholder="Ripeti la password" style={S.input} /></div>
        {error && <div style={{ color: C.danger, fontSize: 12, fontFamily: "monospace" }}>⚠️ {error}</div>}
        <button onClick={handleReset} disabled={loading} style={{ ...S.btnPrimary, opacity: loading ? 0.6 : 1 }}>{loading ? "SALVATAGGIO…" : "AGGIORNA PASSWORD"}</button>
        <button onClick={onBack} style={S.btnGhost}>← Torna indietro</button>
      </div>
    </div>
  );
}

// ── EMPLOYEE VIEW ──────────────────────────────────────────
function EmployeeView({ entries, employees }) {
  const [screen, setScreen] = useState("login");
  const [currentEmp, setCurrentEmp] = useState(null);
  const [regEmployees, setRegEmployees] = useState([]);

  useEffect(() => {
    const unsub = onValue(ref(db, "employees"), snap => {
      const data = snap.val();
      setRegEmployees(data ? Object.entries(data).map(([k, v]) => ({ ...v, id: k })) : []);
    });
    return () => unsub();
  }, []);

  if (screen === "register") return <RegisterScreen onBack={() => setScreen("login")} onSuccess={(emp) => { setCurrentEmp(emp); setScreen("app"); }} employees={regEmployees} />;
  if (screen === "login") return <LoginScreen onLogin={(emp) => { setCurrentEmp(emp); setScreen("app"); }} onRegister={(emps) => { setRegEmployees(emps); setScreen("register"); }} />;
  if (screen === "resetpwd") return <ResetPasswordScreen emp={currentEmp} onBack={() => setScreen("app")} onSuccess={() => { setScreen("app"); }} />;

  return <EmployeeApp emp={currentEmp} entries={entries} onLogout={() => { setCurrentEmp(null); setScreen("login"); }} onResetPwd={() => setScreen("resetpwd")} />;
}

// ── EMPLOYEE APP ───────────────────────────────────────────
function EmployeeApp({ emp, entries, onLogout, onResetPwd }) {
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState(null);
  const [totalPaused, setTotalPaused] = useState(0);
  const [mDate, setMDate] = useState("");
  const [mIn, setMIn] = useState("");
  const [mOut, setMOut] = useState("");
  const [mNota, setMNota] = useState("");
  const [nota, setNota] = useState("");
  const [tab, setTab] = useState("timer");
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const interval = useRef(null);
  const geo = useGps();

  const toast_ = (msg, type) => { setToast({ msg, type: type || "ok" }); setTimeout(() => setToast(null), 2800); };

  useEffect(() => {
    if (activeTimer && !paused) {
      interval.current = setInterval(() => setElapsed(Date.now() - activeTimer - totalPaused), 1000);
    } else {
      clearInterval(interval.current);
    }
    return () => clearInterval(interval.current);
  }, [activeTimer, paused, totalPaused]);

  const saveToFirebase = async (entry) => {
    setSaving(true);
    try { await push(ref(db, "timbrature"), entry); }
    catch (e) { toast_("Errore salvataggio — riprova", "err"); }
    setSaving(false);
  };

  const empName = emp.nome + " " + emp.cognome;

  // Riepilogo mese corrente
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const myEntries = entries.filter(e => e.employeeId === emp.id);
  const monthEntries = myEntries.filter(e => new Date(e.dateIn) >= startOfMonth);
  const monthMs = monthEntries.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);
  const recentEntries = [...myEntries].sort((a, b) => new Date(b.dateIn) - new Date(a.dateIn)).slice(0, 8);

  const startTimer = () => {
    if (geo.state !== "ok") { toast_("Devi essere in sede per timbrare", "err"); return; }
    setActiveTimer(Date.now());
    setPaused(false);
    setPausedAt(null);
    setTotalPaused(0);
    setNota("");
    toast_("Buona giornata! Timer avviato ✓");
  };

  const togglePause = () => {
    if (!paused) {
      setPaused(true);
      setPausedAt(Date.now());
      toast_("⏸ Pausa avviata");
    } else {
      const pauseDur = Date.now() - pausedAt;
      setTotalPaused(prev => prev + pauseDur);
      setPaused(false);
      setPausedAt(null);
      toast_("▶ Ripreso!");
    }
  };

  const stopTimer = async () => {
    const pauseDur = paused ? Date.now() - pausedAt : 0;
    const totPaused = totalPaused + pauseDur;
    const startTime = new Date(activeTimer);
    const dateIn = startTime.toISOString();
    const dateOut = new Date().toISOString();
    setActiveTimer(null);
    setPaused(false);
    setPausedAt(null);
    setTotalPaused(0);
    setElapsed(0);
    await saveToFirebase({ employeeId: emp.id, employeeName: empName, dateIn, dateOut, type: "timer", gps: geo.coords, nota: nota || null, pauseMs: totPaused });
    toast_("Timbratura salvata ✓");
  };

  const saveManual = async () => {
    if (!mDate || !mIn || !mOut) { toast_("Compila tutti i campi", "err"); return; }
    const dateIn = new Date(mDate + "T" + mIn).toISOString();
    const dateOut = new Date(mDate + "T" + mOut).toISOString();
    if (new Date(dateOut) <= new Date(dateIn)) { toast_("L'uscita deve essere dopo l'entrata", "err"); return; }
    const duplicate = myEntries.find(e => new Date(e.dateIn).toISOString().slice(0, 10) === mDate);
    if (duplicate) { setDuplicateWarning(true); return; }
    await doSaveManual();
  };

  const doSaveManual = async () => {
    const dateIn = new Date(mDate + "T" + mIn).toISOString();
    const dateOut = new Date(mDate + "T" + mOut).toISOString();
    await saveToFirebase({ employeeId: emp.id, employeeName: empName, dateIn, dateOut, type: "manual", nota: mNota || null });
    setMDate(""); setMIn(""); setMOut(""); setMNota("");
    setDuplicateWarning(false);
    toast_("Timbratura manuale salvata ✓");
  };

  return (
    <>
      <Toast toast={toast} />
      {duplicateWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}>
          <div style={{ background: C.surface, borderRadius: 20, padding: 28, maxWidth: 320, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text, textAlign: "center", marginBottom: 8 }}>Timbratura già presente</div>
            <div style={{ fontSize: 13, color: C.textSub, textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>
              Esiste già una timbratura per il <strong>{mDate ? new Date(mDate).toLocaleDateString("it-IT", { day: "2-digit", month: "long" }) : ""}</strong>. Vuoi aggiungerla comunque?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDuplicateWarning(false)} style={{ flex: 1, padding: "12px", background: C.surfaceAlt, border: "1.5px solid " + C.border, borderRadius: 12, color: C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Annulla</button>
              <button onClick={doSaveManual} style={{ flex: 1, padding: "12px", background: C.warn, border: "none", borderRadius: 12, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Aggiungi comunque</button>
            </div>
          </div>
        </div>
      )}
      <div style={S.card}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={S.eyebrow}>BENVENUTO</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>{empName}</div>
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginTop: 2 }}>{emp.email}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onResetPwd} style={{ ...S.btnGhost, padding: "6px 10px", fontSize: 11 }}>🔑</button>
            <button onClick={onLogout} style={S.btnGhost}>Esci</button>
          </div>
        </div>

        {/* Riepilogo mese */}
        <div style={{ background: C.accentLight, borderRadius: 12, padding: "12px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: C.accent, fontFamily: "monospace", letterSpacing: 1 }}>ORE QUESTO MESE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.accent, fontFamily: "Georgia, serif" }}>{formatDuration(monthMs)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: C.textSub, fontFamily: "monospace" }}>TIMBRATURE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>{monthEntries.length}</div>
          </div>
        </div>

        <div style={S.tabs}>
          {[["timer", "⏱ Timer"], ["manual", "✏️ Manuale"], ["history", "📋 Storico"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={tab === k ? S.tabOn : S.tabOff}>{l}</button>
          ))}
        </div>

        {/* TIMER TAB */}
        {tab === "timer" && (
          <div>
            <div style={{ marginBottom: 16 }}><GpsBanner state={geo.state} distance={geo.distance} onCheck={geo.check} /></div>
            {!activeTimer && geo.state !== "ok" && (
              <div style={{ display: "flex", gap: 12, background: C.warnLight, border: "1.5px solid #F6C96640", borderRadius: 12, padding: "13px 16px", marginBottom: 16 }}>
                <span style={{ fontSize: 22 }}>📍</span>
                <div>
                  <div style={{ fontWeight: 600, color: C.warn, fontSize: 13 }}>Posizione richiesta</div>
                  <div style={{ fontSize: 12, color: C.textSub, marginTop: 3, lineHeight: 1.5 }}>Il timer si avvia solo quando sei in sede (entro {GEOFENCE_RADIUS_M}m).</div>
                </div>
              </div>
            )}
            <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
              {activeTimer ? (
                <>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginBottom: 6 }}>
                    ENTRATA · {formatTime(new Date(activeTimer).toISOString())}
                    {paused && <span style={{ color: C.warn, marginLeft: 8 }}>· IN PAUSA</span>}
                  </div>
                  <div style={{ fontSize: 64, fontWeight: 900, color: paused ? C.warn : C.accent, fontFamily: "Georgia, serif", lineHeight: 1, marginBottom: 4 }}>
                    {formatDuration(elapsed)}
                  </div>
                  {totalPaused > 0 && (
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginBottom: 4 }}>
                      pausa totale: {formatDuration(totalPaused)}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginBottom: 16 }}>ORE LAVORATE</div>

                  {/* Nota */}
                  <div style={{ marginBottom: 16, textAlign: "left" }}>
                    <label style={S.label}>Nota (opzionale)</label>
                    <input value={nota} onChange={e => setNota(e.target.value)} placeholder="es. trasferta, straordinario..." style={S.input} />
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={togglePause} style={{
                      flex: 1, padding: "13px", background: paused ? C.accent : C.warnLight,
                      border: "1.5px solid " + (paused ? C.accent : C.warn), borderRadius: 12,
                      color: paused ? "#fff" : C.warn, fontSize: 13, fontWeight: 700,
                      fontFamily: "monospace", cursor: "pointer", letterSpacing: 1,
                    }}>
                      {paused ? "▶ RIPRENDI" : "⏸ PAUSA"}
                    </button>
                    <button onClick={stopTimer} disabled={saving || paused} style={{ ...S.btnDanger, flex: 1, opacity: (saving || paused) ? 0.5 : 1 }}>
                      {saving ? "…" : "⏹ USCITA"}
                    </button>
                  </div>
                  {paused && <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginTop: 8 }}>Riprendi il timer per poter timbrare l'uscita</div>}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 64, fontWeight: 900, color: C.borderStrong, fontFamily: "Georgia, serif", lineHeight: 1, marginBottom: 6 }}>--:--</div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginBottom: 24 }}>TIMER NON ATTIVO</div>
                  <button onClick={startTimer} disabled={geo.state !== "ok"} style={{ ...S.btnPrimary, opacity: geo.state === "ok" ? 1 : 0.38 }}>▶ TIMBRA ENTRATA</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* MANUALE TAB */}
        {tab === "manual" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#EEF2FF", border: "1.5px solid #C7D2FE", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#4338CA", fontFamily: "monospace", lineHeight: 1.5 }}>
              ✏️ La timbratura manuale non richiede GPS — sarà visibile al manager come "Manuale"
            </div>
            <div><label style={S.label}>Data</label><input type="date" value={mDate} onChange={e => setMDate(e.target.value)} style={S.input} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={S.label}>Entrata</label><input type="time" value={mIn} onChange={e => setMIn(e.target.value)} style={S.input} /></div>
              <div><label style={S.label}>Uscita</label><input type="time" value={mOut} onChange={e => setMOut(e.target.value)} style={S.input} /></div>
            </div>
            <div><label style={S.label}>Nota (opzionale)</label><input value={mNota} onChange={e => setMNota(e.target.value)} placeholder="es. trasferta, straordinario..." style={S.input} /></div>
            <button onClick={saveManual} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? "SALVATAGGIO…" : "SALVA TIMBRATURA"}</button>
          </div>
        )}

        {/* STORICO TAB */}
        {tab === "history" && (
          <div>
            {recentEntries.length === 0
              ? <div style={{ color: C.textMuted, textAlign: "center", padding: "28px 0", fontSize: 13, fontFamily: "monospace" }}>Nessuna timbratura</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {recentEntries.map(e => <EntryCard key={e.firebaseKey} entry={e} />)}
                </div>
            }
          </div>
        )}
      </div>
    </>
  );
}

// ── DASHBOARD ──────────────────────────────────────────────
function Dashboard({ entries, employees }) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toDateStr = (d) => d.toISOString().slice(0, 10);

  const [fFrom, setFFrom] = useState(toDateStr(startOfMonth));
  const [fTo, setFTo] = useState(toDateStr(endOfMonth));
  const [fEmps, setFEmps] = useState([]);
  const [fType, setFType] = useState("all");

  useEffect(() => {
    if (employees.length > 0 && fEmps.length === 0) setFEmps(employees.map(e => e.id));
  }, [employees]);

  const toggleEmp = (id) => setFEmps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const filtered = entries.filter(e => {
    if (fFrom && new Date(e.dateIn) < new Date(fFrom)) return false;
    if (fTo && new Date(e.dateIn) > new Date(fTo + "T23:59:59")) return false;
    if (fEmps.length > 0 && !fEmps.includes(e.employeeId)) return false;
    if (fType === "timer" && e.type !== "timer") return false;
    if (fType === "manual" && e.type !== "manual") return false;
    return true;
  });

  const totalMs = filtered.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);
  const timerMs = filtered.filter(e => e.type === "timer").reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);
  const manualMs = filtered.filter(e => e.type === "manual").reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);

  const empStats = employees.map(emp => {
    const es = filtered.filter(e => e.employeeId === emp.id);
    const ms = es.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);
    const timerEs = es.filter(e => e.type === "timer");
    const manualEs = es.filter(e => e.type === "manual");
    return { ...emp, ms, count: es.length, timerCount: timerEs.length, manualCount: manualEs.length, timerMs: timerEs.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0), manualMs: manualEs.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0) };
  }).sort((a, b) => b.ms - a.ms);

  const periodLabel = fFrom + " / " + fTo;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Filtri */}
      <div style={{ ...S.card, margin: "0 16px" }}>
        <div style={S.eyebrow}>FILTRI REPORT</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div><label style={S.label}>Dal</label><input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={S.input} /></div>
          <div><label style={S.label}>Al</label><input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={S.input} /></div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {[["Oggi", toDateStr(now), toDateStr(now)], ["Sett.", toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1)), toDateStr(now)], ["Mese", toDateStr(startOfMonth), toDateStr(endOfMonth)], ["Anno", now.getFullYear() + "-01-01", now.getFullYear() + "-12-31"]].map(([label, from, to]) => (
            <button key={label} onClick={() => { setFFrom(from); setFTo(to); }} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontFamily: "monospace", background: fFrom === from && fTo === to ? C.accent : C.surfaceAlt, color: fFrom === from && fTo === to ? "#fff" : C.textSub, border: "1.5px solid " + (fFrom === from && fTo === to ? C.accent : C.border), cursor: "pointer", fontWeight: 600 }}>{label}</button>
          ))}
        </div>
        <label style={S.label}>Tipo</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["all", "Tutte"], ["timer", "📍 GPS"], ["manual", "✏️ Manuali"]].map(([val, label]) => (
            <button key={val} onClick={() => setFType(val)} style={{ flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 11, fontFamily: "monospace", background: fType === val ? C.accent : C.surfaceAlt, color: fType === val ? "#fff" : C.textSub, border: "1.5px solid " + (fType === val ? C.accent : C.border), cursor: "pointer", fontWeight: 600 }}>{label}</button>
          ))}
        </div>
        <label style={S.label}>Dipendenti</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {employees.map(emp => (
            <button key={emp.id} onClick={() => toggleEmp(emp.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, textAlign: "left", background: fEmps.includes(emp.id) ? C.accentLight : C.surfaceAlt, border: "1.5px solid " + (fEmps.includes(emp.id) ? C.accent : C.border), cursor: "pointer" }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: fEmps.includes(emp.id) ? C.accent : C.surface, border: "1.5px solid " + (fEmps.includes(emp.id) ? C.accent : C.borderStrong), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {fEmps.includes(emp.id) && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{emp.nome} {emp.cognome}</span>
            </button>
          ))}
          {employees.length === 0 && <div style={{ color: C.textMuted, fontSize: 12, fontFamily: "monospace" }}>Nessun dipendente registrato</div>}
        </div>
      </div>

      {/* Totale */}
      <div style={{ ...S.card, margin: "0 16px", background: C.accent }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontFamily: "monospace", letterSpacing: 2, marginBottom: 6 }}>ORE TOTALI NEL PERIODO</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: "#fff", fontFamily: "Georgia, serif", marginBottom: 4 }}>{formatDuration(totalMs)}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>TIMBRATURE</div><div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{filtered.length}</div></div>
          {timerMs > 0 && fType !== "manual" && <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>📍 GPS</div><div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{formatDuration(timerMs)}</div></div>}
          {manualMs > 0 && fType !== "timer" && <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>✏️ MANUALI</div><div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{formatDuration(manualMs)}</div></div>}
        </div>
      </div>

      {/* Export */}
      <div style={{ ...S.card, margin: "0 16px" }}>
        <div style={S.eyebrow}>ESPORTA</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={() => exportCSV(filtered, employees, "timbrature-" + fFrom + "_" + fTo)} style={{ padding: "12px", background: C.accentLight, border: "1.5px solid " + C.accent, borderRadius: 12, color: C.accent, fontSize: 12, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>
            📊 Excel / CSV
          </button>
          <button onClick={() => exportPDF(filtered, periodLabel)} style={{ padding: "12px", background: "#EEF2FF", border: "1.5px solid #C7D2FE", borderRadius: 12, color: "#4338CA", fontSize: 12, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>
            🖨️ Stampa / PDF
          </button>
        </div>
      </div>

      {/* Dettaglio per dipendente */}
      <div style={{ ...S.card, margin: "0 16px" }}>
        <div style={S.eyebrow}>DETTAGLIO PER DIPENDENTE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {empStats.filter(s => fEmps.includes(s.id)).map((s, i, arr) => (
            <div key={s.id} style={{ padding: "14px 0", borderBottom: i < arr.length - 1 ? "1px solid " + C.border : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{s.nome} {s.cognome}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace" }}>{s.email}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.ms > 0 ? C.accent : C.textMuted, fontFamily: "Georgia, serif" }}>{formatDuration(s.ms)}</div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: C.textSub, fontFamily: "monospace" }}>{s.count} timbrature</span>
                {s.timerCount > 0 && <span style={{ fontSize: 11, color: C.accent, fontFamily: "monospace" }}>📍 {s.timerCount} GPS · {formatDuration(s.timerMs)}</span>}
                {s.manualCount > 0 && <span style={{ fontSize: 11, color: "#4338CA", fontFamily: "monospace" }}>✏️ {s.manualCount} manuali · {formatDuration(s.manualMs)}</span>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ color: C.textMuted, textAlign: "center", padding: "20px 0", fontSize: 13, fontFamily: "monospace" }}>Nessun dato nel periodo</div>}
        </div>
      </div>
    </div>
  );
}

// ── MANAGER VIEW ───────────────────────────────────────────
function ManagerView({ entries, employees }) {
  const [pin, setPin] = useState("");
  const [auth, setAuth] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [fEmp, setFEmp] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [pinErr, setPinErr] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const check = () => { if (pin === MANAGER_PIN) { setAuth(true); setPinErr(false); } else { setPinErr(true); setPin(""); } };

  const deleteEntry = async (key) => { await remove(ref(db, "timbrature/" + key)); };
  const deleteEmployee = async (id) => { await remove(ref(db, "employees/" + id)); };

  const filtered = entries.filter(e => {
    if (fEmp !== "all" && e.employeeId !== fEmp) return false;
    if (fFrom && new Date(e.dateIn) < new Date(fFrom)) return false;
    if (fTo && new Date(e.dateIn) > new Date(fTo + "T23:59:59")) return false;
    return true;
  }).sort((a, b) => new Date(b.dateIn) - new Date(a.dateIn));

  const totalMs = filtered.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);

  if (!auth) return (
    <div style={S.card}>
      <div style={S.eyebrow}>ACCESSO MANAGER</div>
      <p style={{ color: C.textSub, fontSize: 13, marginBottom: 20 }}>Inserisci il PIN per accedere</p>
      <input type="password" maxLength={6} value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && check()} placeholder="• • • •" style={{ ...S.input, textAlign: "center", fontSize: 30, letterSpacing: 14 }} />
      {pinErr && <div style={{ color: C.danger, fontSize: 12, marginTop: 8 }}>PIN errato</div>}
      <button onClick={check} style={{ ...S.btnPrimary, marginTop: 16 }}>ACCEDI</button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {confirmDelete && <ConfirmModal title={confirmDelete.type === "employee" ? "Elimina dipendente" : "Elimina timbratura"} message={confirmDelete.type === "employee" ? "Vuoi eliminare questo dipendente?" : "Sei sicuro di voler eliminare questa timbratura?"} onConfirm={() => { confirmDelete.action(); setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />}

      <div style={{ ...S.card, margin: "0 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={S.eyebrow}>PANNELLO MANAGER</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>Agostinelli</div>
          </div>
          <button onClick={() => setAuth(false)} style={S.btnGhost}>Esci</button>
        </div>
      </div>

      <div style={{ padding: "0 16px", marginBottom: 12 }}>
        <div style={S.tabs}>
          {[["dashboard", "📊 Report"], ["timbrature", "📋 Timbrature"], ["dipendenti", "👥 Dipendenti"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={tab === k ? S.tabOn : S.tabOff}>{l}</button>
          ))}
        </div>
      </div>

      {tab === "dashboard" && <Dashboard entries={entries} employees={employees} />}

      {tab === "timbrature" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
          <div style={{ ...S.card, margin: "0 16px" }}>
            <div style={S.eyebrow}>FILTRI</div>
            <select value={fEmp} onChange={e => setFEmp(e.target.value)} style={{ ...S.select, marginBottom: 10 }}>
              <option value="all">Tutti i dipendenti</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.nome} {e.cognome}</option>)}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={S.label}>Dal</label><input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={S.input} /></div>
              <div><label style={S.label}>Al</label><input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={S.input} /></div>
            </div>
            {(fEmp !== "all" || fFrom || fTo) && <button onClick={() => { setFEmp("all"); setFFrom(""); setFTo(""); }} style={{ ...S.btnGhost, marginTop: 10, width: "100%" }}>Reset filtri</button>}
          </div>
          <div style={{ ...S.card, margin: "0 16px" }}>
            <div style={S.eyebrow}>ESPORTA</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => exportCSV(filtered, employees, "timbrature")} style={{ padding: "12px", background: C.accentLight, border: "1.5px solid " + C.accent, borderRadius: 12, color: C.accent, fontSize: 12, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>📊 Excel / CSV</button>
              <button onClick={() => exportPDF(filtered, "Timbrature")} style={{ padding: "12px", background: "#EEF2FF", border: "1.5px solid #C7D2FE", borderRadius: 12, color: "#4338CA", fontSize: 12, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>🖨️ PDF</button>
            </div>
          </div>
          <div style={{ padding: "0 16px" }}>
            <div style={{ ...S.eyebrow, marginBottom: 10 }}>{filtered.length} TIMBRATURE</div>
            {filtered.length === 0
              ? <div style={{ background: C.surface, borderRadius: 12, padding: 28, textAlign: "center", color: C.textMuted, fontSize: 13, fontFamily: "monospace", border: "1.5px solid " + C.border }}>Nessuna timbratura trovata</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filtered.map(e => <EntryCard key={e.firebaseKey} entry={e} onDelete={(key) => setConfirmDelete({ type: "timbratura", action: () => deleteEntry(key) })} />)}
                </div>
            }
          </div>
        </div>
      )}

      {tab === "dipendenti" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ ...S.eyebrow, marginBottom: 10 }}>{employees.length} DIPENDENTI REGISTRATI</div>
          {employees.length === 0
            ? <div style={{ background: C.surface, borderRadius: 12, padding: 28, textAlign: "center", color: C.textMuted, fontSize: 13, fontFamily: "monospace", border: "1.5px solid " + C.border }}>Nessun dipendente registrato</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {employees.map(emp => {
                  const empEntries = entries.filter(e => e.employeeId === emp.id);
                  const totalMs = empEntries.reduce((s, e) => s + (new Date(e.dateOut) - new Date(e.dateIn)), 0);
                  return (
                    <div key={emp.id} style={{ background: C.surface, borderRadius: 12, padding: "14px 15px", border: "1.5px solid " + C.border }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{emp.nome} {emp.cognome}</div>
                          <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginTop: 2 }}>{emp.email}</div>
                          <div style={{ fontSize: 11, color: C.textSub, fontFamily: "monospace", marginTop: 4 }}>{empEntries.length} timbrature · {formatDuration(totalMs)}</div>
                        </div>
                        <button onClick={() => setConfirmDelete({ type: "employee", action: () => deleteEmployee(emp.id) })} style={{ padding: "5px 10px", background: C.dangerLight, border: "1px solid " + C.danger + "40", borderRadius: 8, color: C.danger, fontSize: 11, cursor: "pointer", fontFamily: "monospace" }}>Rimuovi</button>
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>
      )}
    </div>
  );
}

// ── APP ────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("employee");
  const [entries, setEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let eLoaded = false, empLoaded = false;
    const done = () => { if (eLoaded && empLoaded) setLoading(false); };
    const u1 = onValue(ref(db, "timbrature"), snap => { const d = snap.val(); setEntries(d ? Object.entries(d).map(([k, v]) => ({ ...v, firebaseKey: k })) : []); eLoaded = true; done(); });
    const u2 = onValue(ref(db, "employees"), snap => { const d = snap.val(); setEmployees(d ? Object.entries(d).map(([k, v]) => ({ ...v, id: k })) : []); empLoaded = true; done(); });
    return () => { u1(); u2(); };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, paddingBottom: 48 }}>
      <style>{"* { box-sizing: border-box; margin: 0; padding: 0; } select, input { outline: none; } select:focus, input:focus { border-color: " + C.accent + " !important; box-shadow: 0 0 0 3px " + C.accentLight + "; } button:active { transform: scale(0.97); }"}</style>
      <div style={{ background: C.surface, borderBottom: "1.5px solid " + C.border, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
        <div>
          <div style={{ fontSize: 9, color: C.accent, letterSpacing: 3, fontFamily: "monospace", fontWeight: 700 }}>AGRITURISMO AGOSTINELLI</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>Timbrature</div>
        </div>
        <Clock />
      </div>
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", background: C.surface, borderRadius: 12, border: "1.5px solid " + C.border, overflow: "hidden" }}>
          {[["employee", "👤 Dipendente"], ["manager", "🔑 Manager"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ flex: 1, padding: "11px 8px", background: view === k ? C.accent : "transparent", border: "none", color: view === k ? "#fff" : C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.18s" }}>{l}</button>
          ))}
        </div>
      </div>
      {loading
        ? <div style={{ textAlign: "center", padding: 60, color: C.textMuted, fontFamily: "monospace", fontSize: 13 }}>Connessione a Firebase…</div>
        : <div style={{ padding: view === "manager" ? "16px 0 0" : "16px" }}>
            {view === "employee" ? <EmployeeView entries={entries} employees={employees} /> : <ManagerView entries={entries} employees={employees} />}
          </div>
      }
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
