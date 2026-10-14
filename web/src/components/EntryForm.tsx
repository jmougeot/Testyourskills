// Le champ unique de l'entrée (§6.1) : deux onglets GitHub / CV,
// et un lien discret « les deux » pour la comparaison.
import { useEffect, useId, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { pick, useT } from "../i18n";
import { api, ApiError, tokens } from "../lib/api";
import { navigate } from "../lib/router";
import { markFresh, rememberInput, takePrefill } from "../lib/session";
import type { Mode, Tab } from "../lib/session";
import { checkPdf, parseLogin } from "../lib/util";
import { IconArrow, IconClose, IconDoc, IconGithub, IconUpload } from "./Icons";

export function EntryForm({ inputRef }: { inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const { t, lang } = useT();
  const h = t.home;
  const [init] = useState(() => takePrefill());
  const [mode, setMode] = useState<Mode>(init?.mode ?? "single");
  const [tab, setTab] = useState<Tab>(init?.tab ?? "github");
  const [login, setLogin] = useState(init?.login ?? "");
  const [file, setFile] = useState<File | null>(init?.file ?? null);
  const [error, setError] = useState<string | null>(init?.error ? (typeof init.error === "string" ? init.error : pick(init.error, lang)) : null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const localLoginRef = useRef<HTMLInputElement>(null);
  const loginRef = inputRef ?? localLoginRef;
  const uid = useId().replace(/:/g, "");

  const showGithub = mode === "both" || tab === "github";
  const showCv = mode === "both" || tab === "cv";

  useEffect(() => {
    if (init?.mode === "both" || init?.login) loginRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickFile = async (f: File | undefined | null) => {
    if (!f) return;
    const check = await checkPdf(f);
    if (!check.ok) {
      setFile(null);
      setError(check.reason === "not_pdf" ? h.errNotPdf : check.reason === "too_large" ? h.errTooLarge(check.mb) : h.errTooManyPages(check.pages));
      return;
    }
    setError(null);
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void pickFile(e.dataTransfer.files?.[0]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    let parsed: string | null = null;
    if (showGithub) {
      if (!login.trim()) {
        setError(h.errEmptyLogin);
        loginRef.current?.focus();
        return;
      }
      parsed = parseLogin(login);
      if (!parsed) {
        setError(h.errLogin);
        loginRef.current?.focus();
        return;
      }
    }
    if (showCv && !file) {
      setError(h.errEmptyCv);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await api.createCard({ login: parsed ?? undefined, cv: showCv ? file ?? undefined : undefined, lang });
      if (res.deleteToken) tokens.set(res.id, res.deleteToken);
      rememberInput({ login: parsed ?? undefined, file: showCv ? file : null });
      markFresh(res.id);
      navigate(`/c/${res.id}`);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.fact) setError(pick(err.fact, lang));
      else setError(h.errNetwork);
    }
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
  };

  const sizeLabel = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`).replace("Mo", lang === "fr" ? "Mo" : "MB").replace("Ko", lang === "fr" ? "Ko" : "KB");

  return (
    <form className={`entry mode-${mode}`} onSubmit={submit} noValidate>
      {mode === "single" ? (
        <div className="seg entry-tabs" role="tablist" aria-label={h.tabsLabel}>
          <span className="seg-thumb" data-pos={tab === "github" ? 0 : 1} aria-hidden />
          <button type="button" role="tab" id={`${uid}-tg`} aria-selected={tab === "github"} aria-controls={`${uid}-panel`} onClick={() => switchTab("github")}>
            <IconGithub />
            {h.tabGithub}
          </button>
          <button type="button" role="tab" id={`${uid}-tc`} aria-selected={tab === "cv"} aria-controls={`${uid}-panel`} onClick={() => switchTab("cv")}>
            <IconDoc />
            {h.tabCv}
          </button>
        </div>
      ) : (
        <div className="entry-both-head">
          <span className="both-badge">
            <i>CV</i>
            <b>vs</b>
            <i>GH</i>
          </span>
          <span>{h.bothActive}</span>
        </div>
      )}

      <div className="entry-panel" id={`${uid}-panel`} role={mode === "single" ? "tabpanel" : undefined} aria-labelledby={mode === "single" ? (tab === "github" ? `${uid}-tg` : `${uid}-tc`) : undefined}>
        {showGithub && (
          <div className="field">
            <label htmlFor={`${uid}-gh`} className="sr-only">
              {h.loginLabel}
            </label>
            <span className="field-prefix" aria-hidden>
              github.com/
            </span>
            <input
              ref={loginRef}
              id={`${uid}-gh`}
              className="field-input"
              type="text"
              inputMode="url"
              autoComplete="off"
              name="gh-handle"
              data-1p-ignore=""
              data-lpignore="true"
              data-bwignore="true"
              data-form-type="other"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={h.loginPlaceholder}
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
                if (error) setError(null);
              }}
              onBlur={() => {
                const p = parseLogin(login);
                if (p && p !== login) setLogin(p);
              }}
              aria-invalid={!!error && showGithub && !file}
              aria-describedby={`${uid}-err ${uid}-hint`}
            />
            {mode === "single" && (
              <button type="submit" className="btn-primary field-submit" disabled={busy}>
                <span>{busy ? h.submitting : h.submit}</span>
                <IconArrow />
              </button>
            )}
          </div>
        )}

        {showCv && (
          <div
            className={`drop${drag ? " is-drag" : ""}${file ? " has-file" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInput}
              id={`${uid}-file`}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="drop-file">
                <span className="drop-file-icon" aria-hidden>
                  PDF
                </span>
                <span className="drop-file-meta">
                  <b>{file.name}</b>
                  <span>{sizeLabel(file.size)}</span>
                </span>
                <button type="button" className="icon-btn" onClick={() => setFile(null)} aria-label={h.dropRemove}>
                  <IconClose />
                </button>
              </div>
            ) : (
              <label htmlFor={`${uid}-file`} className="drop-empty">
                <span className="drop-icon" aria-hidden>
                  <IconUpload />
                </span>
                <span className="drop-title">{h.dropTitle}</span>
                <span className="drop-sub">
                  {h.dropOr} <u>{h.dropBrowse}</u> · {h.dropHint}
                </span>
              </label>
            )}
          </div>
        )}

        {(mode === "both" || tab === "cv") && (
          <button type="submit" className="btn-primary entry-submit" disabled={busy}>
            <span>{busy ? h.submitting : mode === "both" ? h.submitBoth : h.submit}</span>
            <IconArrow />
          </button>
        )}
      </div>

      <p id={`${uid}-err`} className={`entry-error${error ? " is-on" : ""}`} role="alert">
        {error}
      </p>

      <div className="entry-foot" id={`${uid}-hint`}>
        <span className="entry-reassure">{h.reassure}</span>
        <button
          type="button"
          className="link-both"
          onClick={() => {
            setMode((m) => (m === "single" ? "both" : "single"));
            setError(null);
          }}
        >
          {mode === "single" ? h.bothLink : h.bothBack}
        </button>
      </div>
    </form>
  );
}
