import { api } from "../lib/api";

export async function obterReg(consulta: string, opts?: { refreshToken?: boolean; pageSize?: number; maxPages?: number }) {
  const { data } = await api.post<{ rows: Array<Record<string, any>> }>("/api/obter-reg", {
    consulta,
    refreshToken: opts?.refreshToken ?? false,
    pageSize: opts?.pageSize ?? 4500,
    maxPages: opts?.maxPages ?? 25,
  });
  return data.rows || [];
}
