import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import logo from "../assets/nx_boats.png"; // coloque sua logo em src/assets/logo.png

const LoginPage: React.FC = () => {
  const { login } = useAuth();
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
      await login(u, p); // chama o backend: POST /api/auth/login
      const from = (location.state as any)?.from?.pathname ?? "/";
      nav(from, { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.erro || "Usuário ou senha inválidos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-white to-slate-50 px-4">
      <Card className="w-full max-w-sm border-0 shadow-xl">
        <CardHeader className="items-center text-center gap-2">
          {/* Logo */}
          <img src={logo} alt="NX Boats" className="h-10 w-auto" />
          <CardTitle className="text-lg">Entrar</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm">Usuário</label>
              <Input
                value={u}
                onChange={(e) => setU(e.target.value)}
                placeholder="NOMUSU"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm">Senha</label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  value={p}
                  onChange={(e) => setP(e.target.value)}
                  placeholder="******"
                  autoComplete="current-password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100"
                  aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}

            <Button
              type="submit"
              disabled={loading || !u || !p}
              className="w-full"
            >
              {loading ? "Entrando…" : "Entrar"}
            </Button>

            {/* dica opcional */}
            <p className="mt-2 text-xs text-slate-500">
              Use seu usuário e senha do Sankhya (NOMUSU / INTERNO).
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
