// src/services/depLinhaLegado.ts
// A tradução ANTIGA departamento → linha, pelo AD_DEPLINHA.CODPROJPAI.
//
// Era o `SQL_LINHA_DO_PONTO` do opeService. O OPE passou para a base nova
// (setor pelo TFPDEP.AD_CODGRUPO, galpão pelo AD_CODPLP, linha pelo
// AD_DEPMODELO — ver services/opeService), mas duas telas continuam na antiga
// por decisão de escopo: a aba "Por setor produtivo" do Absenteísmo e a coluna
// Pessoas da Meta de Produção (services/quadroService). A expressão saiu para cá
// BYTE A BYTE igual, para essas consultas não mudarem nem uma vírgula.
//
// Espera o alias `DEPL` para AD_DEPLINHA na consulta que a usa.
//
// As duas traduções conhecidas:
//   480 → 500
//   600 → 620  a linha NX620 tem CODPROJPAI 1060000000.
export const SQL_LINHA_DO_PONTO_DEPLINHA = `'NX' || CASE SUBSTR(DEPL.CODPROJPAI, 3, 3)
                                      WHEN '480' THEN '500'
                                      WHEN '600' THEN '620'
                                      ELSE SUBSTR(DEPL.CODPROJPAI, 3, 3)
                                 END`;
