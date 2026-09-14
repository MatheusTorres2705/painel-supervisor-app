import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { mensagemErro } from "@/lib/sankhyaRetorno";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import logo from "@/assets/nx_boats.png";
import logoWhite from "@/assets/nx_boats_white.svg";

/** Onda decorativa do painel de marca. */
function OceanWaves() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 w-full"
      viewBox="0 0 800 600"
      preserveAspectRatio="none"
      fill="none"
    >
      <path
        d="M0 380 C 160 320, 260 440, 420 390 S 680 320, 800 370 L800 600 L0 600 Z"
        fill="hsl(var(--accent))"
        opacity="0.14"
      />
      <path
        d="M0 450 C 180 400, 300 500, 460 460 S 700 400, 800 440 L800 600 L0 600 Z"
        fill="hsl(var(--accent))"
        opacity="0.1"
      />
      <path
        d="M0 520 C 200 480, 320 560, 500 530 S 720 490, 800 515 L800 600 L0 600 Z"
        fill="hsl(var(--accent))"
        opacity="0.08"
      />
    </svg>
  );
}

const LoginPage: React.FC = () => {
  const { login, motivoSaida } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!u || !p) return;
    setErr(null);
    setLoading(true);
    try {
      await login(u, p); // POST /api/auth/login
      // Volta para a tela de onde a sessão caiu, com a query string (filtros na URL).
      const origem = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
      nav(origem?.pathname ? `${origem.pathname}${origem.search ?? ""}` : "/", { replace: true });
    } catch (e: unknown) {
      setErr(mensagemErro(e, "Usuário ou senha inválidos"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Painel de marca — só em telas grandes. */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-hover lg:flex lg:flex-col lg:justify-between lg:p-12">
        <OceanWaves />

        <img
          src={logoWhite}
          alt="NX Boats"
          className="relative h-9 w-auto self-start"
        />

        <div className="relative max-w-md space-y-4">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-primary-foreground">
            Painel Supervisor
          </h1>
          <p className="text-sm leading-relaxed text-primary-foreground/70">
            Operações e planejamento em um só lugar — equipe, atividades,
            materiais e horas, sempre em dia com o ERP.
          </p>
        </div>

        <p className="relative text-2xs text-primary-foreground/50">
          © {new Date().getFullYear()} NX Boats
        </p>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <img
              src={logo}
              alt="NX Boats"
              className="mx-auto h-8 w-auto lg:hidden"
            />
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Entrar
            </h2>
            <p className="text-sm text-muted-foreground">
              Use seu usuário e senha do Sankhya.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {/* Sem isto, a sessão vencida aparecia como "Token inválido" no meio
                da tela e o usuário achava que era bug. */}
            {motivoSaida === "expirada" && !err ? (
              <Alert variant="info" title="Sua sessão expirou">
                Entre novamente para continuar de onde parou.
              </Alert>
            ) : null}
            {err ? <Alert variant="destructive">{err}</Alert> : null}

            <Field label="Usuário" required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={u}
                  onChange={(e) => setU(e.target.value)}
                  placeholder="NOMUSU"
                  autoComplete="username"
                  autoFocus
                />
              )}
            </Field>

            <Field label="Senha" required>
              {(fieldProps) => (
                <div className="relative">
                  <Input
                    {...fieldProps}
                    type={showPass ? "text" : "password"}
                    value={p}
                    onChange={(e) => setP(e.target.value)}
                    placeholder="••••••"
                    autoComplete="current-password"
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPass ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
            </Field>

            <Button
              type="submit"
              size="lg"
              disabled={loading || !u || !p}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Entrando…
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          <p className="text-center text-2xs text-muted-foreground lg:text-left">
            Credenciais do Sankhya (NOMUSU / INTERNO).
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
