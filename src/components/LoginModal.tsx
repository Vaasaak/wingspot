import { useState } from "react";
import { supabase } from "../lib/supabase";

// Přihlášení přes „magic link" – uživatel zadá e-mail, přijde mu odkaz,
// kliknutím se přihlásí. Žádná hesla. Login je nepovinný (jen pro uložení
// oblíbených a nastavení napříč zařízeními).
export function LoginModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [msg, setMsg] = useState("");

  async function send() {
    if (!supabase || !email.includes("@")) return;
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setState("error");
      const detail = [error.message, (error as { status?: number }).status].filter(Boolean).join(" – status ");
      setMsg(detail || "Přihlášení se nezdařilo. Zkus to znovu.");
    } else {
      setState("sent");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Přihlášení</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {state === "sent" ? (
            <div className="login-sent">
              <div style={{ fontSize: "2rem" }}>📧</div>
              <p>
                Poslali jsme ti přihlašovací odkaz na <b>{email}</b>. Otevři
                e-mail a klikni na odkaz – tím se přihlásíš.
              </p>
              <p className="muted small">
                Odkaz nevidíš? Mrkni i do spamu. Můžeš okno zavřít.
              </p>
            </div>
          ) : (
            <>
              <p className="muted small">
                Přihlášení je <b>nepovinné</b> – appka funguje i bez něj. Slouží
                jen k uložení oblíbených spotů a nastavení napříč zařízeními.
                Žádné heslo: pošleme ti odkaz na e-mail.
              </p>
              <input
                className="text-input"
                type="email"
                inputMode="email"
                placeholder="tvuj@email.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                style={{ marginTop: 10 }}
              />
              {state === "error" && (
                <p className="warn-text small">⚠ {msg}</p>
              )}
              <button
                className="btn"
                onClick={send}
                disabled={state === "sending" || !email.includes("@")}
                style={{ marginTop: 12, width: "100%" }}
              >
                {state === "sending" ? "Posílám…" : "Poslat přihlašovací odkaz"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
