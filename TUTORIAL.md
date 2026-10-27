# CUBOTino Web — tutorial

Versão em JavaScript (Babylon.js + WebXR) da interface `PC_files/` (Python/Tkinter/OpenCV).
A lógica do projeto foi mantida: planificação do cubo → solver Kociemba → tradução para movimentos do robô
(`S`pin, `F`lip, `R`otate) → envio ao ESP32 pela porta serial. Tudo roda no navegador, sem instalar Python.

## 1. Requisitos

| Para | Precisa de |
|---|---|
| Rodar / desenvolver | Node.js 18+ (testado no 24) |
| Webcam | Qualquer navegador moderno; `getUserMedia` exige `localhost` ou HTTPS |
| Robô real (serial) | Chrome ou Edge (Web Serial) + ESP32 com o firmware de `ESP32_files/` |
| AR | Chrome para Android (ARCore), **HTTPS** |
| VR | Meta Quest Browser (ou emulador WebXR no desktop), **HTTPS** |

## 2. Executar

```bash
cd web
npm install
npm run dev        # http://localhost:5173  (também exposto na rede local)
```

Outros comandos:

```bash
npm test           # valida a lógica contra o código Python original (precisa de `python` no PATH)
npm run build      # gera web/dist (estático, ~215 kB gzip + chunk de XR carregado só ao entrar em AR/VR)
npm run preview    # serve web/dist
```

`dist/` usa caminhos relativos: pode ser publicado em qualquer pasta (GitHub Pages, Netlify, servidor próprio).

## 3. Fluxo correto de uso (passo a passo)

### 3.1 Informar o estado do cubo (escolha **um** método)

1. **Planificação na tela** — selecione uma cor na paleta e clique (ou arraste) nos facelets. A roda do mouse
   troca a cor do facelet. Os centros são fixos e definem as cores (U branco, R vermelho, F verde, D amarelo,
   L laranja, B azul).
   *Orientação do cubo*: segure o cubo com **F (verde) voltado para você e U (branco) para cima**; é a mesma
   orientação em que o robô o recebe.
2. **Aleatório** — gera um cubo embaralhado e já resolve.
3. **Webcam** — clique em **📷 Webcam** e permita o acesso:
   - Alinhe cada face dentro da grade 3×3 (os nove quadradinhos devem ficar sobre os nove facelets).
   - Ordem das faces: **U → R → F → D → L → B**. O texto na tela diz como posicionar cada uma.
     Partindo de F para você e U para cima: *U* = incline o topo para a câmera (lado B para cima na imagem);
     *R, F, L, B* = gire o cubo na horizontal, mantendo U para cima; *D* = incline a base para a câmera
     (lado F para cima na imagem).
   - A captura é automática após o **atraso** configurado (padrão 6 s), ou imediata em *Capturar agora*.
   - Boa luz difusa, sem reflexos, ajuda muito a diferenciar vermelho de laranja.
   - Ao terminar, o cubo é interpretado (CIEDE2000 com referências dinâmicas; se o solver rejeitar,
     tenta o fallback HSV, como no original) e resolvido automaticamente.

> Se aparecer *"Leitura incoerente"*, refaça a leitura: o cubo lido é fisicamente impossível
> (cor trocada, face mostrada duas vezes, etc.).

### 3.2 Resolver e visualizar

1. Clique em **Resolver**. O painel mostra a solução (notação `U1 R3 F2…`: 1 = 90° horário, 2 = 180°, 3 = anti-horário)
   e os **movimentos do robô** (`F`=flip, `S`=spin, `R`=giro da camada inferior, sempre seguidos de 1 ou 3).
2. Use os controles sob o modelo 3D: ⏮ início · ▶/⏸ executar · ⏭ um passo · velocidade.
   O cubo mostra exatamente o que o robô faz, e ao final cada face fica de uma cor só.
3. Arraste para orbitar, roda/pinça para zoom.

### 3.3 Robô real (opcional)

1. Grave o firmware de `ESP32_files/` como no PDF de montagem e ligue o ESP32 por USB.
2. **Conectar ESP32** → escolha a porta serial (115200 baud).
3. Resolva o cubo e clique **Enviar ao robô**. O protocolo é o da GUI Python: a solução vai como
   `<U1R3…(Nf)>`, o robô devolve a mesma string, o navegador envia `[start]`, e as mensagens `i_N` do robô
   avançam o progresso e a animação em tempo real. **STOP** envia `[stop]`.
4. Coloque o cubo no robô com **F para a frente e U para cima** (como no esboço do CUBOTino na GUI original).

> O ajuste de servos (sliders de PWM, `Cubotino_settings.txt`) **não** foi portado: continue usando a GUI Python
> (`PC_files/Cubotino_GUI.py`) para calibrar o robô uma vez. Depois da calibração, esta interface basta.

### 3.4 Realidade aumentada / virtual

WebXR só funciona em **HTTPS** (ou `localhost` em alguns navegadores). Para testar no celular/headset a partir do PC:

```bash
npm run build && npm run preview          # em um terminal
npx cloudflared tunnel --url http://localhost:4173     # em outro: gera uma URL https://… pública
```

(ou publique `dist/` no GitHub Pages/Netlify). Abra a URL no dispositivo e:

- **AR** (Chrome Android): toque em **AR**, mova o celular até aparecer o anel verde sobre uma superfície,
  **toque** para posicionar o cubo (~10 cm) e use ▶ ⏭ ⏮ no overlay. A animação inicia sozinha.
- **VR** (Quest): toque em **VR**; o modelo aparece à frente, em escala de mesa, executando a solução.

Se o navegador não suportar WebXR, os botões AR/VR ficam desativados e todo o resto continua funcionando.

## 4. Mapa Python → JavaScript

| Python (`PC_files/`) | JavaScript (`web/src/`) | Observação |
|---|---|---|
| `Cubotino_moves.py` | `moves.js` | Port 1:1 (tabela `moves_dict`, rastreio de orientação, `optimize_moves`, `count_moves`). Testado: saída idêntica em 40 cubos aleatórios |
| `cube_facelets_permutation` (GUI) | `cube.js` | Permutações agora derivadas da geometria; conferidas contra as tabelas do Python |
| `twophase` (Kociemba, ~70 MB de tabelas em disco) | `solver.worker.js` (min2phase) | Mesmo algoritmo two-phase; tabelas geradas em ~0,2 s na memória; roda em Web Worker |
| `Cubotino_webcam.py` (OpenCV) | `webcam.js` + `color.js` | Interpretação de cor portada (Lab/CIEDE2000 dinâmico + HSV). A detecção de contornos foi trocada por grade-guia 3×3 |
| `Cubotino_GUI.py` (Tkinter) | `main.js`, `index.html`, `style.css` | Editor de planificação, paleta, aleatório, modo embaralhar, progresso |
| UART (pyserial) | `serial.js` | Web Serial, mesmo protocolo (`<…>`, `[start]`, `[stop]`, `i_N`, `solved`) |
| esboço 2D do robô | `scene3d.js` + `public/models/robot.glb` | Seu modelo CAD (`suporte_cubo.glb`) em 3D com Babylon.js + WebXR |

## 4.1 Modelo 3D do robô (`suporte_cubo.glb`)

O arquivo original (CAD, Draco, ~5 milhões de vértices) é pesado demais para o navegador. O script
`tools/prepare-model.mjs` o converte e o app carrega o resultado:

```bash
npm run model     # lê web/suporte_cubo.glb e gera public/models/robot.glb + robot.json
```

- Simplifica a malha (5 M → ~117 mil vértices) e quantiza; saída ~1,9 MB (~0,5 MB com gzip), sem Draco (sem decoder).
- Endireita o modelo (a exportação CAD vinha girada): a placa-base fica no chão e o eixo do suporte do cubo
  é medido (inclinado ~20°, como no robô real). O cubo é posicionado nesse eixo, em escala real (57 mm).
- Animação: `Cube_holder` e eixos dos servos giram em torno do eixo do suporte (spin/rotate); `Top_cover`
  gira na dobradiça (flip). Se o GLB falhar ao carregar, o app usa um robô esquemático de reserva.
- Cores (em `PART_STYLE`, `src/scene3d.js`): parte inferior vermelha; parte superior (tampa, dobradiça, alavanca) em cinza metálico polido (reflexo de estúdio procedural, sem HDRI externo).
- Logo SENAI (`public/models/senai-logo.png`) na lateral da tampa, presa a ela (acompanha o movimento). Posição/tamanho: constante `LOGO`. Para trocar a imagem, substitua o PNG (mantenha a proporção ou ajuste `LOGO.aspect`).
- Ajustes finos no topo de `scene3d.js`: `CUBE_YAW` (qual face do cubo fica voltada para o lado oposto à
  dobradiça; use múltiplos de 90°), `CUBE_SEAT` (altura do cubo no suporte), `HINGE_PIN` (eixo da tampa, medido no cilindro da dobradiça do modelo) , `COVER` (ângulos) e `COVER_DZ` (deslocamento lateral da tampa, 5 mm).
- Para trocar o modelo: substitua `web/suporte_cubo.glb` e rode `npm run model` (se a orientação mudar, recalcule `HINGE_PIN`).

## 5. O que foi otimizado

- **Cubo = 1 malha, 1 draw call**: 27 cubies + 54 adesivos como *thin instances*, cor por instância. Cada passo
  do robô só reescreve 81 matrizes.
- **Render sob demanda**: fora de animação, interação ou XR, o loop não renderiza (economiza bateria no celular).
- **Babylon modular** (`@babylonjs/core/...`), sem loaders/GUI/Inspector; o WebXR (~110 kB gzip) é um chunk à parte,
  carregado só ao clicar em AR/VR.
- **Solver fora da thread principal** (Web Worker) e pré-aquecido em segundo plano.
- **Sem tabelas de 70 MB**: o navegador baixa ~215 kB (gzip) no total.
- O modelo CAD foi reduzido de ~5 M de vértices para ~117 mil (veja 4.1).
- Sem OpenCV.js (~8 MB): a leitura de cor usa só `canvas`.

## 6. Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| Botão *Conectar ESP32* desativado | Navegador sem Web Serial: use Chrome ou Edge |
| Webcam não abre | Precisa de `localhost` ou HTTPS; verifique a permissão do site |
| *Leitura incoerente* | Reflexos / vermelho≈laranja. Mude a luz, aumente o atraso, mostre as faces na orientação indicada |
| AR/VR desativados | Sem HTTPS, ou dispositivo sem WebXR. Veja 3.4 |
| *Os centros das faces estão trocados* | Na planificação, os centros são fixos: pinte os facelets com as cores dos centros |
| Robô inicia mas o cubo não resolve | Cubo colocado fora da orientação F-frente/U-cima, ou servos descalibrados (use a GUI Python) |

## 7. Limitações conhecidas

- A integração **serial** e o **AR/VR** não foram testados com hardware real nesta sessão (só em navegador desktop
  headless: render, solver, animação e testes da lógica). Teste o `[start]`/`i_N` com o robô parado antes de uso normal.
- A leitura por webcam exige alinhar o cubo à grade; não há detecção automática de contornos.
- `min2phase.js` é licenciado GPL-3.0. Se for redistribuir o app, confira a compatibilidade com a sua licença;
  trocar por outro solver exige mudar só `solver.worker.js`.
