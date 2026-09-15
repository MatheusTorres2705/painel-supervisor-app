// src/lib/fotoFuncionario.ts
// Foto do funcionário vinda do Sankhya ERP (porta 8180).
//
// A URL é relativa de propósito: a 8180 só fala HTTP, então apontar direto para
// lá a partir de uma página servida em HTTPS daria mixed content (a imagem seria
// bloqueada pelo navegador). Quem resolve o upstream é o proxy — o Caddy quando
// servido em https://sankhya.nxboats.com.br:3120, o `server.proxy` do
// vite.config.ts em dev local.
export const fotoUrl = (codfunc: number) =>
  `/mge/Funcionario@IMAGEM@CODEMP=1@CODFUNC=${codfunc}.dbimage`;
