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

Para o botão **Publicar** funcionar, configure uma vez na engrenagem um
token do GitHub (fine-grained, com acesso só a este repositório e
permissão *Contents: Read and write*). O token fica guardado apenas no
navegador em que você configurou.

Sem token, ainda dá para usar **Baixar videos.json** e subir o arquivo
manualmente no GitHub.

## Estrutura

- `index.html`: casca da página
- `css/style.css`: visual (mobile first, tema claro e escuro)
- `js/app.js`: lista, busca, categorias, player, favoritos e modo admin
- `videos.json`: a lista de vídeos publicados
- `assets/`: logo, avatar do canal e o padrão blue merle

## Rodar localmente

```sh
python3 -m http.server 8000
```

e abra http://localhost:8000.
