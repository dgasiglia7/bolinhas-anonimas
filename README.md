# Bolinhas Anônimas

Site de vídeos de border collie com visual inspirado no YouTube e paleta
vermelho/branco + cinzas do blue merle. É um site estático (HTML, CSS e JS
puros), publicado pelo GitHub Pages.

## Como adicionar vídeos

1. Abra o site com `#/admin` no final do endereço (uma vez só, em cada
   navegador que você usar para administrar). Aparecem o botão **Criar**,
   o **+** na barra de baixo e a engrenagem de publicação.
2. Toque em **Criar**, cole o link do YouTube (funciona com `youtu.be`,
   `watch?v=`, Shorts e links de compartilhamento). O título é preenchido
   sozinho quando possível; escolha as categorias e toque em **Adicionar**.
3. O vídeo aparece na hora, marcado como "Não publicado", só no seu
   navegador. Toque em **Publicar** para gravar o `videos.json` no GitHub.
   Em cerca de 1 minuto o site atualiza para todo mundo.

Para editar um vídeo já publicado, toque no lápis ao lado da lixeira.

Para o botão **Publicar** funcionar, cada navegador precisa de uma
**chave de publicação** (token fine-grained do GitHub, com acesso só a este
repositório e permissão *Contents: Read and write*). A tela **Publicar no
site** (engrenagem) mostra se o navegador já tem a chave, testa a chave ao
salvar e traz o passo a passo para criar uma. A chave fica guardada apenas
no navegador em que foi colada; em outro computador é preciso colar de novo.

Sem chave, a mesma tela ensina a publicar manualmente: **Baixar lista de
vídeos** e enviar o `videos.json` pela página de upload do GitHub.

## Estrutura

- `index.html`: casca da página
- `css/style.css`: visual (mobile first, tema claro e escuro)
- `js/app.js`: lista, busca, categorias, player, favoritos e modo admin
- `videos.json`: a lista de vídeos publicados
- `assets/`: logo, avatar do canal e o padrão blue merle

## Rodar localmente

No Windows, dê clique duplo em `abrir-site.cmd` (precisa do Node.js). Ele
sobe um servidor em http://localhost:8000 e abre o navegador; feche a
janela preta para parar. Em qualquer sistema:

```sh
node tools/servidor-local.mjs
```

Abrir o `index.html` direto (clique duplo) não funciona: o navegador
bloqueia a leitura do `videos.json` em endereços `file://`.
