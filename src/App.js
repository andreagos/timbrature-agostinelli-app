import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, remove, set } from "firebase/database";

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

// semplice hash per offuscare la password
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

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

function ConfirmModal({ onConfirm, onCancel, title, message }) {
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
          {title || "Conferma eliminazione"}
        </div>
        <div style={{ fontSize: 13, color: C.textSub, textAlign: "center", marginBottom: 24, lineHeight: 1.5 }}>
          {message || "Sei sicuro? L'operazione non può essere annullata."}
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
          title="Elimina timbratura"
          message="Sei sicuro di voler eliminare questa timbratura?"
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

// ── REGISTRAZIONE ────────────────────────────────────────
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
    const exists = employees.find(e => e.email === email.toLowerCase());
    if (exists) { setError("Email già registrata"); return; }
    setLoading(true);
    try {
      const newRef = push(ref(db, "employees"));
      await set(newRef, {
        nome, cognome, email: email.toLowerCase(),
        passwordHash: simpleHash(password),
        createdAt: new Date().toISOString(),
      });
      onSuccess({ id: newRef.key, nome, cognome, email: email.toLowerCase() });
    } catch (e) {
      setError("Errore — riprova");
    }
    setLoading(false);
  };

  return (
    <div style={S.card}>
      <div style={S.eyebrow}>CREA ACCOUNT</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif", marginBottom: 20 }}>
        Registrati
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={S.label}>Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Marco" style={S.input} />
          </div>
          <div>
            <label style={S.label}>Cognome</label>
            <input value={cognome} onChange={e => setCognome(e.target.value)} placeholder="Rossi" style={S.input} />
          </div>
        </div>
        <div>
          <label style={S.label}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="marco@agostinelli.it" style={S.input} />
        </div>
        <div>
          <label style={S.label}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimo 6 caratteri" style={S.input} />
        </div>
        <div>
          <label style={S.label}>Conferma password</label>
          <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="Ripeti la password" style={S.input} />
        </div>
        {error && <div style={{ color: C.danger, fontSize: 12, fontFamily: "monospace" }}>⚠️ {error}</div>}
        <button onClick={handleRegister} disabled={loading} style={{ ...S.btnPrimary, opacity: loading ? 0.6 : 1 }}>
          {loading ? "REGISTRAZIONE…" : "CREA ACCOUNT"}
        </button>
        <button onClick={onBack} style={S.btnGhost}>← Torna al login</button>
      </div>
    </div>
  );
}

// ── LOGIN DIPENDENTE ─────────────────────────────────────
function LoginScreen({ onLogin, onRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const unsub = onValue(ref(db, "employees"), snap => {
      const data = snap.val();
      if (data) setEmployees(Object.entries(data).map(([k, v]) => ({ ...v, id: k })));
      else setEmployees([]);
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
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif", marginBottom: 20 }}>
        Accedi
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={S.label}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="la-tua@email.it" style={S.input} />
        </div>
        <div>
          <label style={S.label}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••" style={S.input} />
        </div>
        {error && <div style={{ color: C.danger, fontSize: 12, fontFamily: "monospace" }}>⚠️ {error}</div>}
        <button onClick={handleLogin} style={S.btnPrimary}>ACCEDI</button>
        <div style={{ textAlign: "center", fontSize: 12, color: C.textSub }}>
          Non hai un account?
        </div>
        <button onClick={() => onRegister(employees)} style={S.btnGhost}>Registrati →</button>
      </div>
    </div>
  );
}

// ── EMPLOYEE VIEW ─────────────────────────────────────────
function EmployeeView({ entries, employees }) {
  const [screen, setScreen] = useState("login"); // login | register | app
  const [currentEmp, setCurrentEmp] = useState(null);
  const [regEmployees, setRegEmployees] = useState([]);

  useEffect(() => {
    const unsub = onValue(ref(db, "employees"), snap => {
      const data = snap.val();
      if (data) setRegEmployees(Object.entries(data).map(([k, v]) => ({ ...v, id: k })));
      else setRegEmployees([]);
    });
    return () => unsub();
  }, []);

  if (screen === "register") return (
    <RegisterScreen
      onBack={() => setScreen("login")}
      onSuccess={(emp) => { setCurrentEmp(emp); setScreen("app"); }}
      employees={regEmployees}
    />
  );

  if (screen === "login") return (
    <LoginScreen
      onLogin={(emp) => { setCurrentEmp(emp); setScreen("app"); }}
      onRegister={(emps) => { setRegEmployees(emps); setScreen("register"); }}
    />
  );

  return <EmployeeApp emp={currentEmp} entries={entries} onLogout={() => { setCurrentEmp(null); setScreen("login"); }} />;
}

// ── EMPLOYEE APP (dopo login) ─────────────────────────────
function EmployeeApp({ emp, entries, onLogout }) {
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

  const empName = emp.nome + " " + emp.cognome;
  const myEntries = entries.filter(e => e.employeeId === emp.id).sort((a, b) => new Date(b.dateIn) - new Date(a.dateIn)).slice(0, 6);

  const startTimer = () => {
    if (geo.state !== "ok") { toast_("Devi essere in sede per timbrare", "err"); return; }
    setActiveTimer(Date.now());
    toast_("Buona giornata! Timer avviato ✓");
  };

  const stopTimer = async () => {
    const dateIn = new Date(Date.now() - elapsed).toISOString();
    const dateOut = new Date().toISOString();
    setActiveTimer(null);
    await saveToFirebase({ employeeId: emp.id, employeeName: empName, dateIn, dateOut, type: "timer", gps: geo.coords });
    toast_("Timbratura salvata ✓");
  };

  const saveManual = async () => {
    if (!mDate || !mIn || !mOut) { toast_("Compila tutti i campi", "err"); return; }
    const dateIn = new Date(mDate + "T" + mIn).toISOString();
    const dateOut = new Date(mDate + "T" + mOut).toISOString();
    if (new Date(dateOut) <= new Date(dateIn)) { toast_("L'uscita deve essere dopo l'entrata", "err"); return; }
    await saveToFirebase({ employeeId: emp.id, employeeName: empName, dateIn, dateOut, type: "manual" });
    setMDate(""); setMIn(""); setMOut("");
    toast_("Timbratura manuale salvata ✓");
  };

  return (
    <>
      <Toast toast={toast} />
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={S.eyebrow}>BENVENUTO</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif" }}>{empName}</div>
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginTop: 2 }}>{emp.email}</div>
          </div>
          <button onClick={onLogout} style={S.btnGhost}>Esci</button>
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
              <input type="date" value={mDate} onChange={e => setMDate(e.target.value)} style={S.input} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={S.label}>Entrata</label><input type="time" value={mIn} onChange={e => setMIn(e.target.value)} style={S.input} /></div>
              <div><label style={S.label}>Uscita</label><input type="time" value={mOut} onChange={e => setMOut(e.target.value)} style={S.input} /></div>
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
                  {myEntries.map(e => <EntryCard key={e.firebaseKey} entry={e} />)}
                </div>
            }
          </div>
        )}
      </div>
    </>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────
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
    if (employees.length > 0 && fEmps.length === 0) {
      setFEmps(employees.map(e => e.id));
    }
  }, [employees]);

  const toggleEmp = (id) => {
    setFEmps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...S.card, margin: "0 16px" }}>
        <div style={S.eyebrow}>FILTRI REPORT</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div><label style={S.label}>Dal</label><input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={S.input} /></div>
          <div><label style={S.label}>Al</label><input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={S.input} /></div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            ["Oggi", toDateStr(now), toDateStr(now)],
            ["Sett.", toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1)), toDateStr(now)],
            ["Mese", toDateStr(startOfMonth), toDateStr(endOfMonth)],
            ["Anno", now.getFullYear() + "-01-01", now.getFullYear() + "-12-31"],
          ].map(([label, from, to]) => (
            <button key={label} onClick={() => { setFFrom(from); setFTo(to); }} style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 11, fontFamily: "monospace",
              background: fFrom === from && fTo === to ? C.accent : C.surfaceAlt,
              color: fFrom === from && fTo === to ? "#fff" : C.textSub,
              border: "1.5px solid " + (fFrom === from && fTo === to ? C.accent : C.border),
              cursor: "pointer", fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>
        <label style={S.label}>Tipo timbratura</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["all", "Tutte"], ["timer", "📍 GPS"], ["manual", "✏️ Manuali"]].map(([val, label]) => (
            <button key={val} onClick={() => setFType(val)} style={{
              flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 11, fontFamily: "monospace",
              background: fType === val ? C.accent : C.surfaceAlt,
              color: fType === val ? "#fff" : C.textSub,
              border: "1.5px solid " + (fType === val ? C.accent : C.border),
              cursor: "pointer", fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>
        <label style={S.label}>Dipendenti</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {employees.map(emp => (
            <button key={emp.id} onClick={() => toggleEmp(emp.id)} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 10, textAlign: "left",
              background: fEmps.includes(emp.id) ? C.accentLight : C.surfaceAlt,
              border: "1.5px solid " + (fEmps.includes(emp.id) ? C.accent : C.border),
              cursor: "pointer",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 4,
                background: fEmps.includes(emp.id) ? C.accent : C.surface,
                border: "1.5px solid " + (fEmps.includes(emp.id) ? C.accent : C.borderStrong),
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {fEmps.includes(emp.id) && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{emp.nome} {emp.cognome}</span>
              <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginLeft: "auto" }}>{emp.email}</span>
            </button>
          ))}
          {employees.length === 0 && <div style={{ color: C.textMuted, fontSize: 12, fontFamily: "monospace" }}>Nessun dipendente registrato</div>}
        </div>
      </div>

      <div style={{ ...S.card, margin: "0 16px", background: C.accent }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontFamily: "monospace", letterSpacing: 2, marginBottom: 6 }}>ORE TOTALI NEL PERIODO</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: "#fff", fontFamily: "Georgia, serif", marginBottom: 4 }}>{formatDuration(totalMs)}</div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>TIMBRATURE</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{filtered.length}</div>
          </div>
          {fType !== "manual" && timerMs > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>📍 GPS</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{formatDuration(timerMs)}</div>
            </div>
          )}
          {fType !== "timer" && manualMs > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>✏️ MANUALI</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{formatDuration(manualMs)}</div>
            </div>
          )}
        </div>
      </div>

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
                <div style={{ fontSize: 20, fontWeight: 700, color: s.ms > 0 ? C.accent : C.textMuted, fontFamily: "Georgia, serif" }}>
                  {formatDuration(s.ms)}
                </div>
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

// ── MANAGER VIEW ──────────────────────────────────────────
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

  const deleteEntry = async (firebaseKey) => {
    await remove(ref(db, "timbrature/" + firebaseKey));
  };

  const deleteEmployee = async (id) => {
    await remove(ref(db, "employees/" + id));
  };

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
      <p style={{ color: C.textSub, fontSize: 13, marginBottom: 20 }}>Inserisci il PIN per accedere al pannello</p>
      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginBottom: 6 }}>Demo PIN: 1234</div>
      <input type="password" maxLength={4} value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && check()} placeholder="• • • •" style={{ ...S.input, textAlign: "center", fontSize: 30, letterSpacing: 14 }} />
      {pinErr && <div style={{ color: C.danger, fontSize: 12, marginTop: 8 }}>PIN errato</div>}
      <button onClick={check} style={{ ...S.btnPrimary, marginTop: 16 }}>ACCEDI</button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {confirmDelete && (
        <ConfirmModal
          title={confirmDelete.type === "employee" ? "Elimina dipendente" : "Elimina timbratura"}
          message={confirmDelete.type === "employee" ? "Vuoi eliminare questo dipendente? Non potrà più accedere." : "Sei sicuro di voler eliminare questa timbratura?"}
          onConfirm={() => { confirmDelete.action(); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

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
            {(fEmp !== "all" || fFrom || fTo) && (
              <button onClick={() => { setFEmp("all"); setFFrom(""); setFTo(""); }} style={{ ...S.btnGhost, marginTop: 10, width: "100%" }}>Reset filtri</button>
            )}
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
                          <div style={{ fontSize: 11, color: C.textSub, fontFamily: "monospace", marginTop: 4 }}>
                            {empEntries.length} timbrature · {formatDuration(totalMs)} totali
                          </div>
                        </div>
                        <button onClick={() => setConfirmDelete({ type: "employee", action: () => deleteEmployee(emp.id) })} style={{
                          padding: "5px 10px", background: C.dangerLight,
                          border: "1px solid " + C.danger + "40", borderRadius: 8,
                          color: C.danger, fontSize: 11, cursor: "pointer", fontFamily: "monospace",
                        }}>Rimuovi</button>
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

// ── APP ───────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("employee");
  const [entries, setEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let entriesLoaded = false, employeesLoaded = false;
    const checkDone = () => { if (entriesLoaded && employeesLoaded) setLoading(false); };

    const unsubEntries = onValue(ref(db, "timbrature"), snap => {
      const data = snap.val();
      setEntries(data ? Object.entries(data).map(([k, v]) => ({ ...v, firebaseKey: k })) : []);
      entriesLoaded = true; checkDone();
    });

    const unsubEmployees = onValue(ref(db, "employees"), snap => {
      const data = snap.val();
      setEmployees(data ? Object.entries(data).map(([k, v]) => ({ ...v, id: k })) : []);
      employeesLoaded = true; checkDone();
    });

    return () => { unsubEntries(); unsubEmployees(); };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, paddingBottom: 48 }}>
      <style>{"* { box-sizing: border-box; margin: 0; padding: 0; } select, input { outline: none; } select:focus, input:focus { border-color: " + C.accent + " !important; box-shadow: 0 0 0 3px " + C.accentLight + "; } button:active { transform: scale(0.97); }"}</style>

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
          {view === "employee"
            ? <EmployeeView entries={entries} employees={employees} />
            : <ManagerView entries={entries} employees={employees} />
          }
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
  btnGhost: { width: "100%", padding: "11px", background: "transparent", border: "1.5px solid " + C.border, borderRadius: 12, color: C.textSub, fontSize: 12, fontFamily: "monospace", cursor: "pointer" },
  tabs: { display: "flex", gap: 4, marginBottom: 0, background: C.surfaceAlt, borderRadius: 10, padding: 4 },
  tabOn: { flex: 1, padding: "8px 4px", background: C.surface, border: "none", color: C.accent, fontSize: 11, cursor: "pointer", fontFamily: "monospace", fontWeight: 700, borderRadius: 7, boxShadow: "0 1px 4px rgba(0,0,0,0.1)" },
  tabOff: { flex: 1, padding: "8px 4px", background: "transparent", border: "none", color: C.textSub, fontSize: 11, cursor: "pointer", fontFamily: "monospace", borderRadius: 7 },
};
