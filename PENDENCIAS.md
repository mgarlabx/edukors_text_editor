# Pendências: notarização Apple e Microsoft Store do Text Editor

Estado em 2026-11-07. O código já segue o mesmo procedimento do Slides e do Graph. Está no branch local
`store-release`, com commit feito mas **sem push**, e nenhuma Action foi disparada. O que falta depende de você, em
sites ou com credenciais que eu não posso acessar. Apague este arquivo quando tudo estiver feito.

## O que já está pronto (no branch `store-release`)

- `electron-builder.yml`:
  - macOS: DMG e ZIP universais.
  - Windows: instalador NSIS `.exe` e MSIX `.appx` para a Store, com o publisher real da conta
    (`CN=25CB0A95-…`, o mesmo do Slides e do Graph).
  - Linux: AppImage e `.deb`.
- `.github/workflows/release.yml`: mesmo fluxo do Slides.
  - Roda os testes contra o Common mais recente.
  - Assina e notariza o app e confere a assinatura.
  - Cria cópias com nome fixo (`tools/public-installers.mjs`), além de `SHA256SUMS.txt` e atestado de procedência.
  - Aceita pré-releases `vX.Y.Z-rc.N`.
  - Tem o job **store**, que chama `store.yml`.
- `.github/workflows/store.yml`: cópia do Slides. Envia o MSIX ao Partner Center com o `msstore`. Até você preencher
  `PRODUCT_ID`, só avisa e não envia nada.
- `.github/workflows/store-screenshots.yml` com `tools/store-screenshots.mjs` e `tools/store-sample.mjs`: tira as
  capturas no Windows, a 1920 × 1080, em pt, en e es, com uma ficha de exemplo sobre fotossíntese e uma conversa com o
  assistente. Usa a IA falsa do Common, sem conta real.
- `docs/distribution.md`: procedimento completo. `docs/store-listing.md`: rascunho dos textos da Store nas três línguas.
- README: links de download com nome fixo (`…/releases/latest/download/Edukors-Text-Editor-mac.dmg` etc.). Esses links
  só funcionam depois da primeira release.
- Testes: 27/27 passando. Fiz um build local do Mac sem assinatura para validar a configuração, e ele funcionou.
- Imagens geradas localmente no Mac (`test-results/`, que está no `.gitignore`):
  - `test-results/store-screenshots/{pt,en,es}/01…05.png`: assistente, editor, localizar e substituir, menu de formas
    e grade de tabela.
  - `test-results/store-images/store-logo-{300,1080,2160}.png`: logos 1:1 opcionais.

  As capturas do Mac servem para revisar o conteúdo. **Para a Store, use as do Windows**, geradas pela Action (veja o
  passo 4).

## O que depende de você, em ordem

### 1. Segredos da Apple no repositório do Text (notarização): FEITO em 2026-11-07

Ambiente `release` criado (só tags `v*`, como no Slides) e os cinco segredos cadastrados. Os comandos abaixo ficam como
referência.

O repositório do Text não tem nenhum segredo. O GitHub não deixa ler os valores dos outros repositórios, então é
preciso cadastrá-los de novo, com os arquivos do gerenciador de senhas:

```sh
gh api -X PUT repos/mgarlabx/edukors_text_editor/environments/release   # cria o ambiente "release"
R=mgarlabx/edukors_text_editor
base64 -i certificado.p12 | gh secret set MAC_CERT_P12 -R $R -e release
gh secret set MAC_CERT_PASSWORD -R $R -e release          # pede a senha do .p12
base64 -i AuthKey_A9CQQ9PA49.p8 | gh secret set APPLE_API_KEY -R $R -e release
gh secret set APPLE_API_KEY_ID -R $R -e release -b A9CQQ9PA49
gh secret set APPLE_API_ISSUER -R $R -e release           # o Issuer ID (App Store Connect → Integrations)
```

Recomendado: em **Settings → Environments → release**, exigir revisor, como no Slides.

### 2. Reservar o app no Partner Center: FEITO em 2026-11-07

Store ID **9N0QJKJJTJN6**, já em `store.yml`. Name e Publisher conferem com `electron-builder.yml`. Falta trocar o
"coming soon" do README pelo link da Store, mas só depois que a primeira submissão for aprovada, porque antes disso a
página não existe.

1. Em partner.microsoft.com → **Apps and games → New product → MSIX or PWA app**, reserve o nome
   **Edukors Text Editor**.
2. Em **Product management → Product identity**, anote:
   - **Package/Identity/Name**: confira se é `mgarlabx.EdukorsTextEditor`. Se for diferente, ajuste `identityName` em
     `electron-builder.yml`.
   - **Package/Identity/Publisher**: deve ser `CN=25CB0A95-E013-4D6C-9667-81DF1CC50F46`.
   - **Store ID** (9N… ou 9P…): coloque em `PRODUCT_ID` no `.github/workflows/store.yml`.
3. Me passe o Store ID e eu atualizo `store.yml`, o README (badge e link da Store) e `docs/distribution.md`.

### 3. Segredos e variável do Partner Center no repositório do Text: FEITO em 2026-11-07

Os quatro segredos e `STORE_AUTO_SUBMIT=true` estão cadastrados. O client secret é uma chave nova, criada no app Entra
só para o Text em 2026-11-07, e vence em 2028.

São os mesmos quatro valores usados no Slides e no Graph (app Entra "GitHub Actions - Edukors Store"):

```sh
R=mgarlabx/edukors_text_editor
for s in PARTNER_CENTER_TENANT_ID PARTNER_CENTER_CLIENT_ID PARTNER_CENTER_SELLER_ID PARTNER_CENTER_CLIENT_SECRET; do gh secret set $s -R $R; done
gh variable set STORE_AUTO_SUBMIT -R $R -b true    # o mesmo que o Slides e o Graph usam
```

O client secret vem do gerenciador de senhas ou de **Partner Center → app Entra → Keys**.

### 4. Push do branch e capturas no Windows: FEITO em 2026-11-07

PR #1 com merge no `main`. As capturas do Windows estão em `test-results/store-screenshots-windows/` (no `.gitignore`).
Na mesma ocasião foi corrigida a CI, que falhava desde 4/11 porque o Common passou a mostrar só Cancelar / Substituir.

- `git push -u origin store-release` e abrir um PR. O PR dispara a CI e o workflow "Store screenshots", porque ele
  roda em PRs que mudam os scripts de captura. As imagens do Windows ficam no artefato `store-screenshots` da execução.
- Revisar as imagens e fazer o merge.

### 5. Primeira release: FEITO em 2026-11-07

v26.11.7 publicada. O Mac foi notarizado ("accepted", "Notarized Developer ID"), e os links de download fixos
funcionam. O job da Store falhou como esperado ("first submission"), mas deixou um rascunho de submissão no Partner
Center. O pacote está em `test-results/store-msix/`.

- Atualizar a versão em `package.json`, `app-config.js` e no lockfile (por exemplo, 26.11.7 e `v.26.11.07`), fazer
  commit e push, depois `git tag v26.11.7 && git push origin v26.11.7`.
- A release leva de 30 a 50 minutos, por causa da notarização. Sem o `PRODUCT_ID`, o job da Store só avisa e não
  envia nada, o que é esperado nesta primeira vez.

### 6. Primeira submissão na Store (manual)

O `msstore` só troca o pacote de um app que já tem uma submissão. A primeira é feita à mão no Partner Center:

- **Packages**: o `.appx` do artefato `store-msix` da execução da release.
- **Store listings** (en-US, pt-BR, es-ES): textos em `docs/store-listing.md` e as capturas do Windows (passo 4).
- **Properties**: categoria Productivity, política de privacidade (como nos outros apps) e marcar *"This product
  incorporates generative AI features"* (política 11.16).
- **Age ratings**, **Pricing** (grátis) e **Submission options**: justificativa do `runFullTrust` em
  `docs/store-listing.md`.
- Depois da aprovação, as próximas versões vão sozinhas pelo job **store** da release.

## Pontos a confirmar

- O README e a listagem não afirmam "sem telemetria", porque não verifiquei o código do Text e do Common. O Slides
  tem PRIVACY.md e SECURITY.md; vale criar os mesmos aqui.
- `appx.languages`: deixei en-US, pt-BR e es-ES, como no Slides. A versão anterior tinha também zh-CN e hi-IN, mas a
  ajuda do app só existe em três línguas.
- O `.deb` e o NSIS só foram validados por configuração, porque não há build de Windows ou Linux aqui. A primeira
  execução da Action Release (por exemplo, rodada à mão, sem publicar) vai confirmar.
- No Mac, `release/` ainda tem um DMG antigo (`…-26.11.4-mac.dmg`, do nome anterior), ao lado dos novos
  `…-mac-universal.*`. É só um arquivo local e pode ser apagado.
